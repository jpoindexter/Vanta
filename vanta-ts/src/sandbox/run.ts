import { existsSync, realpathSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { DANGEROUS_DIRS, canonicalPath, expandHome, isDangerousPath, resolveWritableZones } from "../tools/writable-zones.js";
import {
  buildBwrapArgs,
  buildSeatbeltProfile,
  detectBackend,
  wrapCommand,
} from "./profile.js";

// Sandbox seam: `maybeSandbox` is the single entry point both exec sites
// (shell-cmd, run-code) call. Default-off path is byte-identical — when
// VANTA_SANDBOX !== "1" it returns the base cmd/args UNCHANGED. The invariant:
// enabling it only TIGHTENS; it never grants access.

export interface MaybeSandboxArgs {
  env: NodeJS.ProcessEnv;
  root: string;
  /** Actual child cwd. Remote adapters use this as the workspace upload root. */
  workdir?: string;
  /** Extra host directories bound writable for this one already-approved run. */
  additionalWritableDirs?: readonly string[];
  baseCmd: string;
  baseArgs: string[];
}

/** Wrapped command + an optional async cleanup (deletes the temp profile). */
export interface SandboxWrapped {
  cmd: string;
  args: string[];
  cleanup?: () => Promise<void>;
}

/** Returned when VANTA_SANDBOX=1 was requested but no backend exists. */
export interface SandboxError {
  error: string;
}

export type MaybeSandboxResult = SandboxWrapped | SandboxError;

/** True if `r` is the refuse-to-run sentinel. */
export function isSandboxError(r: MaybeSandboxResult): r is SandboxError {
  return "error" in r;
}

function netAllowed(env: NodeJS.ProcessEnv): boolean {
  return env.VANTA_SANDBOX_NET === "1";
}

/** The system /tmp (→ /private/tmp on macOS), symlink-resolved. Null only if it's missing. */
function systemTmp(): string | null {
  try { return realpathSync("/tmp"); } catch { return null; }
}

/**
 * The writable set the sandbox must permit: the project root + every configured
 * writable zone + BOTH temp dirs. tmpdir() ($TMPDIR, /var/folders/…) is load-bearing —
 * run_code execs its interpreter from a `mkdtemp(tmpdir()/…)` dir OUTSIDE root/zones.
 * The system /tmp (/private/tmp) is added too: it's the canonical scratch path users and
 * tools (pip, build steps, agents writing `> /tmp/…`) reach for — denying it under the
 * default-on shell sandbox surprised real workflows with EPERM. Safe — /tmp is scratch,
 * not a credential dir; the DANGEROUS_DIRS denies still override for anything sensitive.
 */
function isSafeAdditionalZone(path: string): boolean {
  const abs = canonicalPath(resolve(path));
  if (isDangerousPath(abs).dangerous) return false;
  return !DANGEROUS_DIRS
    .map((danger) => canonicalPath(resolve(expandHome(danger))))
    .some((danger) => relative(abs, danger) && !relative(abs, danger).startsWith(".."));
}

function writableZonesFor(env: NodeJS.ProcessEnv, additional: readonly string[] = []): string[] {
  const tmp = realpathSync(tmpdir());
  const sys = systemTmp();
  const temps = sys && sys !== tmp ? [tmp, sys] : [tmp];
  const approved = additional.filter(isSafeAdditionalZone).map((zone) => canonicalPath(resolve(zone)));
  return [...new Set([...resolveWritableZones(env).map((z) => resolve(z)), ...approved, ...temps])];
}

/**
 * Wrap a base command in the OS sandbox when opted in. Returns the base UNCHANGED
 * when VANTA_SANDBOX !== "1" (default off). When =1 with a backend, wraps it.
 * When =1 with NO backend, returns the error sentinel so the caller REFUSES to
 * run — never silently unsandboxed (that would violate the user's explicit
 * intent). Seatbelt writes its profile to a temp file; `cleanup` removes it.
 */
export async function maybeSandbox(a: MaybeSandboxArgs): Promise<MaybeSandboxResult> {
  if (a.env.VANTA_SANDBOX !== "1") {
    return { cmd: a.baseCmd, args: a.baseArgs };
  }
  const backend = detectBackend(process.platform);
  if (backend === null) {
    return {
      error:
        `VANTA_SANDBOX=1 but no OS sandbox backend on ${process.platform} ` +
        `(needs macOS sandbox-exec or Linux bwrap). Refusing to run unsandboxed. ` +
        `Unset VANTA_SANDBOX or run on a supported platform.`,
    };
  }
  const root = resolve(a.root);
  const zones = writableZonesFor(a.env, a.additionalWritableDirs);
  const opts = { net: netAllowed(a.env) };
  const argv = [a.baseCmd, ...a.baseArgs];

  if (backend === "bwrap") {
    // bwrap errors on a --tmpfs target that doesn't exist, so mask only the
    // dangerous dirs actually present on this host (drops macOS-only /System etc.).
    const maskDirs = DANGEROUS_DIRS.map((p) => resolve(expandHome(p))).filter(existsSync);
    const bwrapArgs = buildBwrapArgs(root, zones, opts, maskDirs);
    return wrapCommand("bwrap", bwrapArgs, argv);
  }

  const profile = buildSeatbeltProfile(root, zones, opts);
  const dir = await mkdtemp(join(realpathSync(tmpdir()), "vanta-sb-"));
  const profilePath = join(dir, "profile.sb");
  await writeFile(profilePath, profile, "utf8");
  const wrapped = wrapCommand("seatbelt", profilePath, argv);
  return {
    ...wrapped,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}
