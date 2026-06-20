import { z } from "zod";

/**
 * PAPER-CAPABILITY-PRESERVATION — long-term human-capability preservation as a
 * first-class surface (arXiv:2604.14228 §12.6). Overreliance atrophies the human
 * skills needed to supervise the agent, so an OPT-IN mode surfaces what changed +
 * WHY in human-graspable terms and probes comprehension on risky/large changes —
 * keeping the operator in the loop instead of cognitively offloading.
 *
 * This module is PURE: no LLM, no filesystem, no network. The cmd-layer adapter
 * (`repl/capability-cmd.ts`) reads `git diff --stat` and feeds a `ChangeSummary` in.
 */

/** A single changed file with its line deltas, as `git diff --stat` reports them. */
export const ChangedFileSchema = z.object({
  path: z.string().min(1),
  additions: z.number().int().nonnegative().default(0),
  deletions: z.number().int().nonnegative().default(0),
});
export type ChangedFile = z.infer<typeof ChangedFileSchema>;

/** The input shape for the capability surface: what changed + why, plus a risk hint. */
export const ChangeSummarySchema = z.object({
  /** Files touched by the change. */
  files: z.array(ChangedFileSchema).default([]),
  /** Plain-English statement of WHY the change was made (the intent, not the diff). */
  why: z.string().min(1),
  /** Optional caller-supplied risk override; the classifier still inspects the files. */
  risky: z.boolean().optional(),
});
export type ChangeSummary = z.infer<typeof ChangeSummarySchema>;

export type ChangeMagnitude = "small" | "large";

export type CapabilitySurface = {
  /** Human-graspable "what + why" — never a raw diff. */
  summary: string;
  /** A concrete comprehension question — present ONLY when risky or large. */
  probe?: string;
};

export type CapabilityConfig = { enabled: boolean };

// Magnitude thresholds: a change is "large" once it spreads across many files OR
// moves a lot of lines — the point at which a human can no longer hold it in head
// at a glance and is most tempted to rubber-stamp it.
const SMALL_MAX_FILES = 2;
const SMALL_MAX_LINES = 60;

// Risk signals mirror the kernel's own classification so this surface agrees with
// what `assess()` would gate on, rather than inventing a parallel notion of risk:
//   - DELETE_SIGNAL  ← repl/self-monitor.ts `isDestructiveAction` (destructive verbs).
//   - SECRET_SIGNAL  ← src/safety.rs MACHINE_CONFIG (credential/token/auth/.ssh) + EXFIL (api key).
//   - IRREVERSIBLE   ← src/safety.rs IRREVERSIBLE (migrate/migration/db push/deploy/publish/push --force).
//   - PROTECTED_PATH ← src/scope.rs is_protected_path (kernel src/*.rs|*.toml, factory/*, MANIFESTO.md)
//                       plus schema/auth path conventions the kernel treats as Ask-tier.
const DELETE_SIGNAL = /\b(delete|drop|remove|truncate|erase|unlink|purge|wipe)\b/i;
// Stems (secret/credential/token/migrat) intentionally omit a trailing \b so they
// match inflections like "migration"/"credentials"; dotfile tokens (.env/.ssh) omit
// the leading \b since "." is not a word char (no boundary precedes it at a separator).
const SECRET_SIGNAL = /(\bsecret|\bcredential|\btoken\b|\bpassword|\bapi[\s_-]?key|auth\.json|\.ssh|\.env)/i;
const IRREVERSIBLE_SIGNAL = /(\bmigrat|\bdb push\b|\bdeploy|\bpublish|\bforce[\s-]?push|\bpush --force\b|\brebase)/i;
const SCHEMA_PATH = /(migrat|schema|\.sql|seeds?\/)/i;
const AUTH_PATH = /(auth|login|session|oauth|password|secret|credential)/i;

/** Kernel-protected paths (src/scope.rs is_protected_path): editing these is high-stakes. */
function isProtectedPath(path: string): boolean {
  const p = path.replace(/\\/g, "/").toLowerCase();
  if (/^src\/.+\.(rs|toml|lock)$/.test(p) || p === "cargo.toml" || p === "cargo.lock") return true;
  if (/(^|\/)vanta-ts\/src\/factory\/.+\.ts$/.test(p)) return true;
  return p === "manifesto.md" || p.endsWith("/manifesto.md");
}

/** True when a single file path carries a risk signal (secret/schema/auth/protected/delete-named). */
function pathIsRisky(path: string): boolean {
  return (
    isProtectedPath(path) ||
    SCHEMA_PATH.test(path) ||
    AUTH_PATH.test(path) ||
    SECRET_SIGNAL.test(path)
  );
}

/** Total lines moved (added + deleted) across the change. */
function totalLines(change: ChangeSummary): number {
  return change.files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
}

/**
 * Magnitude by file count / line count — pure thresholds. A change is `small` only
 * when it is BOTH few files AND few lines; otherwise it's `large` (worth a probe).
 */
export function assessChangeMagnitude(change: ChangeSummary): ChangeMagnitude {
  const fileCount = change.files.length;
  const lines = totalLines(change);
  return fileCount <= SMALL_MAX_FILES && lines <= SMALL_MAX_LINES ? "small" : "large";
}

/**
 * True when the change touches schema/migration/auth/secrets/protected paths or
 * deletes — reusing the kernel's risk vocabulary (see signal-constant comments).
 * A caller-supplied `risky:true` is honored as an override.
 */
export function isRiskyChange(change: ChangeSummary): boolean {
  if (change.risky) return true;
  if (change.files.some((f) => pathIsRisky(f.path))) return true;
  if (change.files.some((f) => f.deletions > 0 && f.additions === 0)) return true; // pure deletion
  const why = change.why;
  return DELETE_SIGNAL.test(why) || SECRET_SIGNAL.test(why) || IRREVERSIBLE_SIGNAL.test(why);
}

/** Why a change reads as risky — drives a SPECIFIC probe instead of a generic one. */
type RiskReason = "secret" | "schema" | "auth" | "protected" | "delete" | "irreversible";

// Ordered first-match-wins rules — protected paths outrank everything, then secret >
// schema > auth, with a pure-deletion fallback. Kept as data so riskReason stays flat.
const FILE_RULES: ReadonlyArray<[RiskReason, (f: ChangedFile) => boolean]> = [
  ["protected", (f) => isProtectedPath(f.path)],
  ["secret", (f) => SECRET_SIGNAL.test(f.path)],
  ["schema", (f) => SCHEMA_PATH.test(f.path)],
  ["auth", (f) => AUTH_PATH.test(f.path)],
  ["delete", (f) => f.deletions > 0 && f.additions === 0],
];
const WHY_RULES: ReadonlyArray<[RiskReason, RegExp]> = [
  ["secret", SECRET_SIGNAL],
  ["schema", /\bmigrat|\bschema\b/i],
  ["irreversible", IRREVERSIBLE_SIGNAL],
  ["delete", DELETE_SIGNAL],
];

function riskReason(change: ChangeSummary): RiskReason | null {
  for (const f of change.files) {
    const hit = FILE_RULES.find(([, test]) => test(f));
    if (hit) return hit[0];
  }
  const whyHit = WHY_RULES.find(([, re]) => re.test(change.why));
  return whyHit ? whyHit[0] : null;
}

const PROBE_BY_REASON: Record<NonNullable<RiskReason>, string> = {
  secret: "This change involves secrets/credentials. Where do those values come from, and is anything sensitive now exposed or logged?",
  schema: "This change touches the data schema or a migration. Is it reversible, and what existing data does it affect?",
  auth: "This change touches auth/login/session logic. Who can now access what, and what could it let through that it shouldn't?",
  protected: "This change edits a kernel-protected file (the safety boundary itself). Why must this guardrail change, and what does it loosen?",
  delete: "This change removes code or data. What relied on what was removed, and how would you tell if something broke?",
  irreversible: "This change is hard to cleanly undo (migrate/deploy/publish/force-push). What's the rollback if it goes wrong?",
};

function buildSummary(change: ChangeSummary, magnitude: ChangeMagnitude): string {
  const fileCount = change.files.length;
  const lines = totalLines(change);
  const fileWord = fileCount === 1 ? "file" : "files";
  const scope =
    fileCount === 0
      ? "No files changed"
      : `Changed ${fileCount} ${fileWord} (${lines} line${lines === 1 ? "" : "s"} moved, ${magnitude} change)`;
  const names = change.files
    .slice(0, 5)
    .map((f) => `  · ${f.path}  +${f.additions}/-${f.deletions}`)
    .join("\n");
  const more = fileCount > 5 ? `\n  · …and ${fileCount - 5} more` : "";
  const fileBlock = fileCount > 0 ? `\n${names}${more}` : "";
  return `What changed: ${scope}.${fileBlock}\nWhy: ${change.why}`;
}

/**
 * Build the capability-preservation surface: the human-graspable "what + why",
 * plus a comprehension probe ONLY when the change is risky or large. When
 * `opts.enabled` is false the surface is suppressed (empty summary, no probe).
 */
export function buildCapabilitySurface(
  change: ChangeSummary,
  opts: CapabilityConfig,
): CapabilitySurface {
  if (!opts.enabled) return { summary: "" };
  const magnitude = assessChangeMagnitude(change);
  const risky = isRiskyChange(change);
  const summary = buildSummary(change, magnitude);
  if (!risky && magnitude === "small") return { summary };
  const reason = riskReason(change);
  const probe = reason
    ? PROBE_BY_REASON[reason]
    : "This is a large change. In one sentence, what does it do — and what would break if it were wrong?";
  return { summary, probe };
}

/** Resolve the opt-in config from the environment (`VANTA_CAPABILITY_PRESERVE=1`). */
export function resolveCapabilityConfig(env: NodeJS.ProcessEnv): CapabilityConfig {
  const raw = (env.VANTA_CAPABILITY_PRESERVE ?? "").trim().toLowerCase();
  const enabled = raw === "1" || raw === "true" || raw === "on" || raw === "yes";
  return { enabled };
}
