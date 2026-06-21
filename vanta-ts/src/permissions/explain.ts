import type { Risk } from "../types.js";

// Permission EXPLAINER — turns a kernel verdict into a plain-English "why".
// This NEVER re-decides: the kernel `assess()` verdict is authoritative; this
// only renders the reason a human needs to make the approval decision.
// The deterministic explainer is pure + unit-tested; an optional injected LLM
// enrichment is best-effort and falls back to the deterministic text.

/** Input to the explainer: the kernel verdict + the tool + the safety-relevant arg. */
export type ExplainInput = {
  tool: string;
  risk: Risk;
  /** The kernel verdict reason (untrusted text — control-stripped before use). */
  reason?: string;
  /** The safety-relevant arg (path / command / url — untrusted, control-stripped). */
  detail?: string;
};

/** Injected best-effort completer. Takes a prompt, returns enriched text. Never required. */
export type ExplainDeps = { complete?: (prompt: string) => Promise<string> };

const MAX_DETAIL_CHARS = 200;
const MAX_REASON_CHARS = 200;

/** A short risk label for the approval header. Pure. */
export function riskLabel(risk: Risk): string {
  if (risk === "allow") return "✓ safe";
  if (risk === "block") return "✕ blocked";
  return "⚠ needs approval";
}

/**
 * The deterministic explanation: maps {risk, kernel reason, tool, detail} to a
 * plain-English why. Pure — same input always yields the same string. The kernel
 * reason is the source of truth; this phrases it for a human.
 */
export function explainVerdict(input: ExplainInput): string {
  const reason = clean(input.reason, MAX_REASON_CHARS);
  const detail = clean(input.detail, MAX_DETAIL_CHARS);
  const label = riskLabel(input.risk);
  const why = reasonClause(input.risk, reason, detail) ?? riskFallback(input.risk, detail);
  const note = toolNote(input.tool);
  return note ? `${label}: ${why} ${note}` : `${label}: ${why}`;
}

/** The reason → plain-English clause. Returns null when the reason maps to nothing specific. */
function reasonClause(risk: Risk, reason: string, detail: string): string | null {
  const r = reason.toLowerCase();
  if (!r) return null;
  if (/scope|outside|out of root|out-of-root|project root|project folder/.test(r)) {
    return detail
      ? `This writes outside the project folder — approving lets it touch ${detail}.`
      : "This acts outside the project folder.";
  }
  if (/destruct|delete|rm |wipe|overwrite|truncate|drop/.test(r)) {
    return "This looks destructive — it can remove or overwrite existing data.";
  }
  if (/exfiltrat|leak|secret|credential|token|password|api[_ -]?key/.test(r)) {
    return "This touches credentials or could move sensitive data off the machine.";
  }
  if (/irreversible|push|publish|deploy|migrat|history|force/.test(r)) {
    return detail
      ? `This is hard to undo — it ${detail}.`
      : "This is hard to undo once it runs.";
  }
  if (/system|interpreter|eval|pipe|egress|network/.test(r)) {
    return "This runs system-level or network access that can reach beyond the project.";
  }
  // A reason we don't have a specific clause for: surface it verbatim (already control-stripped).
  return risk === "block" ? `Blocked: ${reason}.` : `${capitalize(reason)}.`;
}

/** When there is no usable reason, fall back to a risk-only explanation. */
function riskFallback(risk: Risk, detail: string): string {
  if (risk === "block") return "Blocked: this looks destructive or irreversible.";
  if (risk === "allow") return "This is a read-only or reversible action.";
  return detail
    ? `This needs your approval before it can touch ${detail}.`
    : "This needs your approval before it runs.";
}

/** A tool-specific note appended to the why. Empty for tools we have no note for. */
function toolNote(tool: string): string {
  return TOOL_NOTES[tool] ?? "";
}

const TOOL_NOTES: Record<string, string> = {
  shell_cmd: "(shell_cmd runs a command on this machine.)",
  run_code: "(run_code executes code in a sandbox.)",
  write_file: "(write_file creates or overwrites a file.)",
  edit_file: "(edit_file changes an existing file.)",
  git: "(git push is irreversible once it reaches the remote.)",
  git_push: "(git push is irreversible once it reaches the remote.)",
  browser_act: "(browser_act drives a live web page.)",
  gmail_send: "(gmail_send sends an email you cannot unsend.)",
  drive_create: "(drive_create writes to your Drive.)",
};

/** The LLM enrichment prompt. Pure — builds the request a completer would answer. */
export function buildExplanationPrompt(input: ExplainInput): string {
  const reason = clean(input.reason, MAX_REASON_CHARS) || "(none)";
  const detail = clean(input.detail, MAX_DETAIL_CHARS) || "(none)";
  return [
    "You explain why a tool call needs approval, for a non-expert operator.",
    "Do NOT decide whether to approve — a security kernel already decided. Only explain its decision.",
    "Reply with ONE or TWO plain-English sentences. No JSON, no preamble.",
    "",
    `Tool: ${clean(input.tool, MAX_DETAIL_CHARS) || "(unknown)"}`,
    `Kernel risk: ${input.risk}`,
    `Kernel reason: ${reason}`,
    `Safety-relevant detail: ${detail}`,
    "",
    `For reference, the deterministic explanation is: ${explainVerdict(input)}`,
  ].join("\n");
}

/**
 * The best-effort enriched explanation. When a completer is injected AND returns
 * usable text, that text is used; otherwise (no completer / throw / empty) the
 * deterministic `explainVerdict` is returned. NEVER throws — errors-as-values:
 * any failure degrades to the deterministic text.
 */
export async function explainPermission(input: ExplainInput, deps: ExplainDeps = {}): Promise<string> {
  const deterministic = explainVerdict(input);
  if (!deps.complete) return deterministic;
  try {
    const enriched = clean(await deps.complete(buildExplanationPrompt(input)), 600);
    return enriched.length > 0 ? enriched : deterministic;
  } catch {
    return deterministic;
  }
}

/** Strip control chars (untrusted reason/detail/tool text) + collapse whitespace + cap length. */
function clean(value: string | undefined, max: number): string {
  if (!value) return "";
  // eslint-disable-next-line no-control-regex
  const stripped = value.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
  return stripped.length > max ? `${stripped.slice(0, max).trimEnd()}…` : stripped;
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}
