import { resolve } from "node:path";
import { DANGEROUS_DIRS, DANGEROUS_FILES, expandHome } from "../tools/writable-zones.js";

// Sandbox (opt-in OS isolation) — the PURE builders. These emit the backend
// config text/argv from resolved absolute paths; the impure file/temp work and
// env reads live in run.ts. The invariant: the output only ever TIGHTENS — every
// allow is scoped to root + zones + tmp, every DANGEROUS_DIR is denied, and the
// network is denied unless explicitly opted in. Nothing here can GRANT access
// beyond an unsandboxed run.

export type SandboxBackend = "seatbelt" | "bwrap";

export interface SandboxOpts {
  /** Allow network access. Default (false) → deny. */
  net: boolean;
  /** Project credential/control-plane paths hidden even when root is readable/writable. */
  deniedPaths?: readonly string[];
}

/** DANGEROUS_DIRS resolved to absolute paths (mirrors `isDangerousPath`). */
function dangerousDirsAbs(): string[] {
  return DANGEROUS_DIRS.map((p) => resolve(expandHome(p)));
}

function dangerousAbs(): string[] {
  return [...DANGEROUS_DIRS, ...DANGEROUS_FILES].map((p) => resolve(expandHome(p)));
}

/** Pseudo-devices nearly every program opens read+write (git/node/shells open
 *  /dev/null O_RDWR). Safe to grant — not credential paths. `/dev/tty` (+ioctl) and
 *  `/dev/fd` (subpath) are handled separately in the profile. */
const DEV_WRITE = ["/dev/null", "/dev/zero", "/dev/stdout", "/dev/stderr", "/dev/dtracehelper"];
const REQUIRED_RUNTIME_READS = ["/System/Library/OpenSSL/openssl.cnf"];

/** Quote a path for an SBPL `subpath`/`literal` clause (escapes `"` and `\`). */
function sb(path: string): string {
  return `"${path.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function requireAll(filters: string[]): string {
  return `(require-all ${filters.join(" ")})`;
}

function excludes(paths: readonly string[]): string[] {
  return paths.map((path) => `(require-not (subpath ${sb(resolve(path))}))`);
}

/**
 * macOS Seatbelt profile (`.sb`). Seatbelt does not let a later standalone deny
 * override an unconditional allow. Every read/write grant therefore carries its
 * protected-path exclusions as part of the grant's own `require-all` filter.
 * Reads are broad except for credential/control-plane paths; writes are further
 * constrained to root + writableZones. Network is denied unless `opts.net`.
 */
export function buildSeatbeltProfile(
  root: string,
  writableZones: string[],
  opts: SandboxOpts,
): string {
  const writable = [resolve(root), ...writableZones.map((z) => resolve(z))];
  const denied = [...new Set([...dangerousAbs(), ...(opts.deniedPaths ?? []).map((path) => resolve(path))])];
  const denyFilters = excludes(denied);
  const lines = [
    "(version 1)",
    "(deny default)",
    "; allow the interpreter to exec/fork and resolve basics. process-exec* (star)",
    "; covers exec + the sandbox-inherit variants real binaries need under deny-default.",
    "(allow process-exec*)",
    "(allow process-fork)",
    "(allow sysctl-read)",
    "(allow mach-lookup)",
    // Test runners and other orchestrators must be able to reap workers they
    // spawned inside the same sandbox, without gaining host-wide signal access.
    "(allow signal (target same-sandbox))",
    "; reads: broad runtime/project visibility with credential/control-plane exclusions",
    `(allow file-read* ${requireAll(denyFilters)})`,
    "; one exact runtime exception: this Node distribution opens its public OpenSSL config",
    ...REQUIRED_RUNTIME_READS.map((path) => `(allow file-read* (literal ${sb(path)}))`),
    "; pseudo-devices: reads are covered above; grant WRITE-DATA so tools that open",
    "; /dev/null|tty|fd O_RDWR (git, node, shells) don't get EPERM. Specific ops (not",
    "; file-write*) so the 'only root+zones get file-write*' invariant still holds.",
    ...DEV_WRITE.map((d) => `(allow file-write-data (literal ${sb(d)}))`),
    `(allow file-write-data file-ioctl (literal ${sb("/dev/tty")}))`,
    `(allow file-write-data (subpath ${sb("/dev/fd")}))`,
    "; writes: ONLY under root + zones, with the same protected-path exclusions",
    ...writable.map((z) => `(allow file-write* ${requireAll([`(subpath ${sb(z)})`, ...denyFilters])})`),
    "; protected paths are absent from every matching read/write grant",
  ];
  lines.push("; network", opts.net ? "(allow network*)" : "(deny network*)");
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
  maskDirs: string[] = dangerousDirsAbs(),
  protectedDirs: string[] = [],
  protectedFiles: string[] = [],
): string[] {
  const writable = [resolve(root), ...writableZones.map((z) => resolve(z))];
  // `--ro-bind / /` binds the host /dev read-only → /dev/null writes EPERM. `--dev`
  // overlays a fresh minimal devtmpfs (null/zero/random/urandom/tty/fd, writable).
  const args = ["--ro-bind", "/", "/", "--dev", "/dev"];
  for (const d of maskDirs.map((p) => resolve(p))) {
    if (!within(d, writable)) args.push("--tmpfs", d);
  }
  for (const z of writable) args.push("--bind", z, z);
  for (const d of protectedDirs.map((p) => resolve(p))) args.push("--tmpfs", d);
  for (const f of protectedFiles.map((p) => resolve(p))) args.push("--ro-bind", "/dev/null", f);
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
