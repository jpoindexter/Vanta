// Sandbox-violation expanded view (VANTA-SANDBOX-VIOLATION) — PURE parse + hint
// + format. When the OS sandbox (sandbox/run.ts → macOS Seatbelt / Linux bwrap)
// blocks an action, the command's stderr/stdout carries a deny signal. These
// helpers turn that raw text into a structured violation + an actionable
// breakdown ("what was attempted, which rule blocked it, the env var that lifts
// it") instead of a bare "blocked". A non-sandbox error parses to `null` so the
// caller renders it plainly (current behavior — see the wiring note at EOF).
//
// READ-ONLY: this is a display layer. It never changes a kernel verdict or a
// sandbox rule; it only explains a deny that already happened.

/** The kind of access the sandbox denied. */
export type SandboxViolationKind =
  | "file-write"
  | "file-read"
  | "network"
  | "exec"
  | "unknown";

/** A parsed sandbox denial: the kind, plus the target path/host and the matched
 *  rule label when the deny text named them. */
export interface SandboxViolation {
  kind: SandboxViolationKind;
  /** The path or host the action targeted, when the deny text named one. */
  target?: string;
  /** The sandbox rule/class that matched (e.g. "file-write-create"). */
  rule?: string;
}

// Control chars (C0 incl. ESC 0x1B / BEL 0x07 / newlines, DEL, C1) — stripped
// from any target before it reaches a terminal so a crafted path/host in the
// deny text can't inject an escape sequence into the breakdown. Built from \u
// string escapes (not a raw-byte regex literal) so no control byte lives here.
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f]", "g");
const WHITESPACE_RUN = /\s+/g;

/** Control-strip a target, collapse internal whitespace, trim. Always one safe
 *  line — no escape can survive into the rendered breakdown. */
function cleanTarget(value: string): string {
  return value.replace(CONTROL_CHARS, " ").replace(WHITESPACE_RUN, " ").trim();
}

// macOS Seatbelt: the kernel logs `Sandbox: <proc> deny(1) <op> <target?>` and
// `sandbox-exec` surfaces "Operation not permitted". The <op> names the class
// (file-write-create, file-read-data, network-outbound, process-exec, …).
const SEATBELT_DENY = /\bdeny(?:\((?:\d+)\))?\s+([a-z][a-z0-9-]*)(?:\s+(\S+))?/i;
// Linux bwrap surfaces a bare "bwrap: ... Permission denied" for write/exec; a
// network attempt under --unshare-net surfaces from the wrapped tool itself.
const BWRAP_DENY = /\bbwrap:.*permission denied/i;
const SECCOMP_DENY = /\boperation not permitted\b/i;
const NET_UNREACHABLE = /\bnetwork is unreachable\b|\bcould not resolve host\b/i;

/** Map a Seatbelt operation class (e.g. "file-write-create") to a kind. */
function kindForOp(op: string): SandboxViolationKind {
  const o = op.toLowerCase();
  if (o.startsWith("network")) return "network";
  if (o.startsWith("process-exec") || o.startsWith("process-fork")) return "exec";
  if (o.startsWith("file-write")) return "file-write";
  if (o.startsWith("file-read")) return "file-read";
  if (o.startsWith("file")) return "file-write";
  return "unknown";
}

/** True when `op`/`target` looks like a real filesystem path (so a bwrap/seccomp
 *  deny we couldn't classify by op still gets a target). */
function asTarget(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const clean = cleanTarget(raw);
  return clean.length > 0 ? clean : undefined;
}

/**
 * Parse a sandbox-deny signal out of a command's error/output text. Recognizes
 * the macOS Seatbelt `deny(1) <op> <target>` form (precise: kind + target +
 * rule), Linux bwrap "Permission denied", a generic "Operation not permitted",
 * and a network-unreachable signal. Returns `null` when the text holds no
 * sandbox-deny signal — the caller then renders the error plainly (the
 * pre-existing behavior). Pure; never throws.
 */
export function parseSandboxViolation(errorText: string): SandboxViolation | null {
  if (typeof errorText !== "string" || errorText.length === 0) return null;

  const seatbelt = SEATBELT_DENY.exec(errorText);
  if (seatbelt) {
    const rule = seatbelt[1]!.toLowerCase();
    return { kind: kindForOp(rule), target: asTarget(seatbelt[2]), rule };
  }
  if (NET_UNREACHABLE.test(errorText)) {
    return { kind: "network", rule: "network-outbound" };
  }
  if (BWRAP_DENY.test(errorText)) {
    return { kind: "unknown", rule: "permission-denied" };
  }
  if (SECCOMP_DENY.test(errorText)) {
    return { kind: "unknown", rule: "operation-not-permitted" };
  }
  return null;
}

/**
 * The actionable hint for a violation: the env var (or directive) that would
 * lift this specific deny. Per kind — the writable-dirs allowlist for a write,
 * the readable-dirs allowlist for a read, the network opt-in for a network deny,
 * the global sandbox flag for an exec/unknown deny.
 */
export function violationHint(violation: SandboxViolation): string {
  switch (violation.kind) {
    case "file-write":
      return violation.target
        ? `add ${cleanTarget(violation.target)}'s directory to VANTA_WRITABLE_DIRS to allow this write`
        : "add the target directory to VANTA_WRITABLE_DIRS to allow this write";
    case "file-read":
      return violation.target
        ? `add ${cleanTarget(violation.target)}'s directory to VANTA_READABLE_DIRS to allow this read`
        : "add the target directory to VANTA_READABLE_DIRS to allow this read";
    case "network":
      return "set VANTA_SANDBOX_NET=1 to allow network access inside the sandbox";
    case "exec":
      return "this binary is exec-blocked by the sandbox — run it unsandboxed (unset VANTA_SANDBOX) if you trust it";
    default:
      return "the OS sandbox blocked this — unset VANTA_SANDBOX to run unsandboxed if you trust the action";
  }
}

/** Human label for a kind, for the breakdown headline. */
function kindLabel(kind: SandboxViolationKind): string {
  switch (kind) {
    case "file-write":
      return "file write";
    case "file-read":
      return "file read";
    case "network":
      return "network access";
    case "exec":
      return "process exec";
    default:
      return "action";
  }
}

/**
 * The detailed breakdown block for a sandbox violation: what was attempted
 * (kind + control-stripped target), which sandbox rule/class blocked it, and the
 * actionable hint. Replaces a bare "blocked" so the operator can see + lift the
 * specific deny. The target is always control-stripped (no escape injection).
 */
export function formatSandboxViolation(violation: SandboxViolation): string {
  const kind = kindLabel(violation.kind);
  const target = violation.target ? cleanTarget(violation.target) : "";
  const to = target ? ` to ${target}` : "";
  const rule = violation.rule ? ` — sandbox rule ${violation.rule}` : "";
  return `⛔ Sandbox blocked a ${kind}${to}${rule}. ${violationHint(violation)}`;
}

// WIRING (deferred this round, named for clarity — mirrors the clarity-gate):
// the live surface is the tool error path in `agent/dispatch-tool.ts` (where a
// tool's `{ok:false, output}` is rendered) and the two exec sites
// `tools/shell-cmd.ts` / `tools/run-code.ts` (which return the sandboxed
// command's stderr/stdout). On a non-zero exit under VANTA_SANDBOX=1, the caller
// would run `parseSandboxViolation(output)`; a non-null result is rendered with
// `formatSandboxViolation(...)`; `null` falls through to the plain error string
// (current behavior). `sandbox/run.ts` itself only WRAPS the command — the deny
// text appears in the wrapped command's output, so the parse belongs at the
// tool error boundary, not in run.ts.
