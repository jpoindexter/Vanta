import { realpathSync } from "node:fs";
import { basename, dirname, resolve, sep } from "node:path";
import { resolveInScope } from "../scope.js";
import {
  addSessionDir,
  expandHome,
  isInZone,
  resolveReadableZones,
  resolveWritableZones,
} from "./zones.js";

// The configurable zone-resolution helpers live in `zones.ts`; re-exported here so
// existing importers of "./writable-zones.js" (read-file, write-file, sandbox, exec,
// add-dir, …) resolve unchanged. This file owns the danger-path floor + the shared
// read/write path policy that the file tools call.
export {
  addSessionDir,
  expandHome,
  getSessionDirs,
  isInZone,
  resolveReadableZones,
  resolveWritableZones,
} from "./zones.js";

/**
 * SECURITY (symlink-escape fix): resolve symlinks on the longest EXISTING prefix
 * of `abs`, keeping any not-yet-created tail. So an in-project symlink whose target
 * is outside scope or a credential path is judged by where it ACTUALLY points —
 * the lexical resolve alone let `proj/notes.md -> ~/.ssh/authorized_keys` write the
 * target with zero approval. Pure-ish (reads the FS); never throws.
 */
export function canonicalPath(abs: string): string {
  const tail: string[] = [];
  let cur = resolve(abs);
  for (;;) {
    try {
      const real = realpathSync(cur);
      return tail.length ? resolve(real, ...tail.reverse()) : real;
    } catch {
      const parent = dirname(cur);
      if (parent === cur) return resolve(abs); // reached fs root, nothing existed
      tail.push(basename(cur));
      cur = parent;
    }
  }
}

/** In-root test on a canonical path (both sides canonicalized so macOS /tmp→/private/tmp
 * and any symlinked root don't cause false negatives). */
function isInRoot(canonAbs: string, root: string): boolean {
  const r = canonicalPath(resolve(root));
  return canonAbs === r || canonAbs.startsWith(r + sep);
}

// Dangerous-paths floor: an unconditional floor beneath zones, scope, AND approval
// mode. These credential/system paths are NEVER readable or writable by the file
// tools — distinct from configurable zones, and not overridable by auto-approve.
// Exported so the OS sandbox emits the SAME deny list as the file
// tools — single source of truth, can't drift. Entries use `~` / relative form;
// callers expand via `expandHome` + `resolve` before use (see `isDangerousPath`).
export const DANGEROUS_DIRS = ["~/.ssh", "~/.gnupg", "~/.aws", "~/.config/gcloud", "/etc", "/private/etc", "/System", "/var/db/sudo"];
const DANGEROUS_FILES = [
  "~/.netrc", "~/.npmrc", "~/.pypirc", "~/.docker/config.json", "~/.kube/config",
  "~/.codex/auth.json", "~/.claude/.credentials.json", "~/.vanta/google-tokens.json",
  "~/.bashrc", "~/.bash_profile", "~/.zshrc", "~/.zprofile", "~/.profile",
];

/**
 * True (with a reason) if `abs` is a protected credential/system path the file
 * tools must never read or write — the absolute floor for the dangerous-paths policy.
 */
export function isDangerousPath(abs: string): { dangerous: boolean; reason?: string } {
  if (DANGEROUS_FILES.map((p) => resolve(expandHome(p))).includes(abs)) {
    return { dangerous: true, reason: "a protected credential file" };
  }
  if (DANGEROUS_DIRS.map((p) => resolve(expandHome(p))).some((d) => abs === d || abs.startsWith(d + sep))) {
    return { dangerous: true, reason: "a protected system/credential directory" };
  }
  return { dangerous: false };
}

/**
 * The single read-path policy shared by read_file / describe_image /
 * compare_vision: expand `~`, then require the path to be inside the project
 * root OR a configured readable zone (~/Desktop, the project's parent, etc.).
 * Expanding `~` BEFORE the scope check is load-bearing — otherwise
 * "~/Desktop/x.png" resolves to a bogus "<root>/~/Desktop/x.png" that passes
 * the in-root test then ENOENTs (BUG-IMAGE-DESKTOP-PATH).
 */
export function resolveReadablePath(
  rawPath: string,
  root: string,
  env: NodeJS.ProcessEnv,
): { ok: true; abs: string } | { ok: false; abs: string; error: string } {
  const path = expandHome(rawPath);
  const abs = canonicalPath(resolveInScope(path, root).path);
  const danger = isDangerousPath(abs);
  if (danger.dangerous) {
    return { ok: false, abs, error: `refused: ${path} is ${danger.reason} — never accessible to tools` };
  }
  if (!isInRoot(abs, root) && !isInZone(abs, resolveReadableZones(env, root).map(canonicalPath))) {
    return {
      ok: false,
      abs,
      error: `refused: ${path} is outside the project and not in a readable zone — ask the user to type /add-dir <dir> (adds it to this session, no relaunch) or set VANTA_READABLE_DIRS`,
    };
  }
  return { ok: true, abs };
}

type PathResolution = { ok: true; abs: string } | { ok: false; abs: string; error: string };
type AskFn = (action: string, reason: string, toolName?: string) => Promise<boolean>;

/** Out-of-zone but not dangerous → ask the human; approval adds the dir to the
 *  session (same as /add-dir) and the access proceeds. Dangerous paths never ask. */
async function resolveWithAsk(r: PathResolution, kind: "read" | "write", env: NodeJS.ProcessEnv, ask: AskFn): Promise<PathResolution> {
  if (r.ok || isDangerousPath(r.abs).dangerous) return r;
  const dir = dirname(r.abs);
  const approved = await ask(
    `${kind} ${r.abs}`,
    `outside project scope — approving adds ${dir} to this session`,
    kind === "read" ? "read_file" : "write_file",
  );
  if (!approved) return r;
  addSessionDir(dir, env);
  return { ok: true, abs: r.abs };
}

/** resolveReadablePath, but out-of-zone asks the human instead of refusing. */
export async function resolveReadablePathAsk(rawPath: string, root: string, env: NodeJS.ProcessEnv, ask: AskFn): Promise<PathResolution> {
  return resolveWithAsk(resolveReadablePath(rawPath, root, env), "read", env, ask);
}

/** resolveWritablePath, but out-of-zone asks the human instead of refusing. */
export async function resolveWritablePathAsk(rawPath: string, root: string, env: NodeJS.ProcessEnv, ask: AskFn): Promise<PathResolution> {
  return resolveWithAsk(resolveWritablePath(rawPath, root, env), "write", env, ask);
}

/**
 * The write-path policy shared by write_file / edit_file: dangerous-path floor
 * first (never overridable), then expand ~ and require in-root OR a writable
 * zone. The kernel has already Asked for any out-of-root write; this bounds
 * where that approved write may land.
 */
export function resolveWritablePath(
  rawPath: string,
  root: string,
  env: NodeJS.ProcessEnv,
): { ok: true; abs: string } | { ok: false; abs: string; error: string } {
  const path = expandHome(rawPath);
  const abs = canonicalPath(resolveInScope(path, root).path);
  const danger = isDangerousPath(abs);
  if (danger.dangerous) {
    return { ok: false, abs, error: `refused: ${path} is ${danger.reason} — never writable, even in auto-approve mode` };
  }
  if (!isInRoot(abs, root) && !isInZone(abs, resolveWritableZones(env).map(canonicalPath))) {
    return {
      ok: false,
      abs,
      error: `refused: ${path} is outside the project and not in a writable zone (~/Desktop, ~/Downloads) — ask the user to type /add-dir <dir> (adds it to this session, no relaunch) or set VANTA_WRITABLE_DIRS`,
    };
  }
  return { ok: true, abs };
}
