import { resolve } from "node:path";
import { DANGEROUS_DIRS, expandHome } from "../tools/writable-zones.js";

// CC-SANDBOX (opt-in OS isolation) — the PURE builders. These emit the backend
// config text/argv from resolved absolute paths; the impure file/temp work and
// env reads live in run.ts. The invariant: the output only ever TIGHTENS — every
// allow is scoped to root + zones + tmp, every DANGEROUS_DIR is denied, and the
// network is denied unless explicitly opted in. Nothing here can GRANT access
// beyond an unsandboxed run.

export type SandboxBackend = "seatbelt" | "bwrap";

export interface SandboxOpts {
  /** Allow network access. Default (false) → deny. */
  net: boolean;
}

/** DANGEROUS_DIRS resolved to absolute paths (mirrors `isDangerousPath`). */
function dangerousAbs(): string[] {
  return DANGEROUS_DIRS.map((p) => resolve(expandHome(p)));
}

/** Quote a path for an SBPL `subpath`/`literal` clause (escapes `"` and `\`). */
function sb(path: string): string {
  return `"${path.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * macOS Seatbelt profile (`.sb`). Order is load-bearing: SBPL is last-match-wins,
 * so the DANGEROUS_DIRS denies MUST come AFTER the broad read-allow to override
 * it for those paths (a deny placed before the allow would be dead). Reads are
 * permissive (everything except dangerous dirs); WRITES are strict — only under
 * root + writableZones. Network denied unless `opts.net`.
 */
export function buildSeatbeltProfile(
  root: string,
  writableZones: string[],
  opts: SandboxOpts,
): string {
  const writable = [resolve(root), ...writableZones.map((z) => resolve(z))];
  const lines = [
    "(version 1)",
    "(deny default)",
    "; allow the interpreter to exec/fork and resolve basics. process-exec* (star)",
    "; covers exec + the sandbox-inherit variants real binaries need under deny-default.",
    "(allow process-exec*)",
    "(allow process-fork)",
    "(allow sysctl-read)",
    "(allow mach-lookup)",
    "(allow signal (target self))",
    "; reads: permissive (system libs, binaries, project) — dangerous dirs denied below",
    "(allow file-read*)",
    "; writes: ONLY under the project root + resolved writable zones (incl. temp)",
    ...writable.map((z) => `(allow file-write* (subpath ${sb(z)}))`),
    "; DANGEROUS_DIRS: deny LAST so this overrides the broad read-allow above",
    ...dangerousAbs().map((d) => `(deny file* (subpath ${sb(d)}))`),
  ];
  if (!opts.net) lines.push("; network", "(deny network*)");
  return lines.join("\n") + "\n";
}

/** True if `p` is inside (or equal to) any of `zones`. */
function within(p: string, zones: string[]): boolean {
  return zones.some((z) => p === z || p.startsWith(z + "/"));
}

/**
 * Linux bubblewrap argv. ORDER is load-bearing — bwrap applies binds/tmpfs in
 * sequence, last-wins for an overlapping path:
 *   1. `--ro-bind / /`            — read the whole fs.
 *   2. `--tmpfs <DANGEROUS_DIR>`  — mask credentials (so they're not even readable;
 *      parity with Seatbelt, exceeds the bare spec) — but SKIP any dangerous dir
 *      that sits inside a writable zone, else the mask would clobber its bind.
 *   3. `--bind <zone> <zone>`     — make root + zones (incl. the OS temp dir) writable,
 *      applied AFTER the tmpfs so the writable workdir survives (run_code writes
 *      main.py into a temp dir BEFORE sandbox entry — a `--tmpfs /tmp` over it
 *      would erase that file; binding temp last preserves it).
 * `--unshare-net` cuts the network unless `opts.net`; `--die-with-parent` kills
 * the sandbox if Vanta exits. The trailing `--` separates bwrap's args from the
 * wrapped command (the caller appends cmd+args).
 *
 * `maskDirs` is the caller-filtered DANGEROUS_DIRS to tmpfs-mask. The PURE
 * builder takes it as input (default = all) so the host-dependent "skip paths
 * that don't exist on this box" filter lives in run.ts (bwrap errors on a missing
 * tmpfs target, so e.g. macOS-only /System must be filtered before Linux use).
 */
export function buildBwrapArgs(
  root: string,
  writableZones: string[],
  opts: SandboxOpts,
  maskDirs: string[] = dangerousAbs(),
): string[] {
  const writable = [resolve(root), ...writableZones.map((z) => resolve(z))];
  const args = ["--ro-bind", "/", "/"];
  for (const d of maskDirs.map((p) => resolve(p))) {
    if (!within(d, writable)) args.push("--tmpfs", d);
  }
  for (const z of writable) args.push("--bind", z, z);
  if (!opts.net) args.push("--unshare-net");
  args.push("--die-with-parent", "--");
  return args;
}

/** Pick the sandbox backend for a platform, or null if none is available. */
export function detectBackend(platform: NodeJS.Platform): SandboxBackend | null {
  if (platform === "darwin") return "seatbelt";
  if (platform === "linux") return "bwrap";
  return null;
}

/**
 * Assemble the wrapped invocation from a backend + its profile-path-or-args +
 * the base argv (cmd then its args). Seatbelt: `sandbox-exec -f <profile> <cmd>
 * <args…>`. bwrap: `bwrap <args…> <cmd> <args…>` (the bwrap args already end
 * with `--`).
 */
export function wrapCommand(
  backend: SandboxBackend,
  profileOrArgs: string | string[],
  argv: string[],
): { cmd: string; args: string[] } {
  if (backend === "seatbelt") {
    if (typeof profileOrArgs !== "string") {
      throw new Error("seatbelt wrap needs a profile file path");
    }
    return { cmd: "sandbox-exec", args: ["-f", profileOrArgs, ...argv] };
  }
  if (!Array.isArray(profileOrArgs)) {
    throw new Error("bwrap wrap needs an args array");
  }
  return { cmd: "bwrap", args: [...profileOrArgs, ...argv] };
}
