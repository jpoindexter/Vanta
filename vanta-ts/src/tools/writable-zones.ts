import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, resolve, sep } from "node:path";
import { resolveInScope } from "../scope.js";
import { scratchpadDir } from "./scratchpad.js";

// Path zones — directories outside the project root that the file tools may touch,
// each still kernel-gated (the kernel returns Ask for any out-of-root path). The
// zone allowlist is the BACKSTOP that bounds where an approved access can land, so
// the agent can't be talked into write_file ~/.ssh/authorized_keys by reflex.
//
//   write_file → WRITABLE zones (narrow: where new files may land)
//   read_file  → READABLE zones (broader: reads don't mutate; default includes the
//                project's parent so sibling repos in the same workspace are readable)
//
// Override with VANTA_WRITABLE_DIRS / VANTA_READABLE_DIRS (comma-separated; replaces
// the defaults). `~` expands to home.

const DEFAULT_WRITABLE = ["~/Desktop", "~/Downloads"] as const;

/** Expand a leading `~` to the user's home dir. */
export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return resolve(homedir(), p.slice(2));
  return p;
}

function parseDirs(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean).map((s) => resolve(expandHome(s)));
}

/**
 * Resolve the configured writable zones to absolute dir paths. The agent's
 * scratchpad (a designated temp workspace, see scratchpad.ts) is ALWAYS a
 * writable zone — even when VANTA_WRITABLE_DIRS replaces the defaults — so the
 * agent can write temp files there without a per-file approval. It's one
 * directory, never a widening of scope.
 */
export function resolveWritableZones(env: NodeJS.ProcessEnv): string[] {
  const raw = env.VANTA_WRITABLE_DIRS?.trim();
  const base = raw ? parseDirs(raw) : [...DEFAULT_WRITABLE].map((s) => resolve(expandHome(s)));
  const extra = env.VANTA_EXTRA_DIRS?.trim() ? parseDirs(env.VANTA_EXTRA_DIRS) : [];
  return [...base, ...extra, scratchpadDir(env)];
}

/**
 * Resolve the configured readable zones. Default = the project's PARENT dir (so
 * sibling repos in the same workspace, e.g. ~/Documents/GitHub/theft-kit, are
 * readable) plus the writable zones. Reads are kernel-Asked per out-of-root path.
 */
export function resolveReadableZones(env: NodeJS.ProcessEnv, root: string): string[] {
  const raw = env.VANTA_READABLE_DIRS?.trim();
  const base = raw ? parseDirs(raw) : [dirname(resolve(root)), ...resolveWritableZones(env)];
  const extra = env.VANTA_EXTRA_DIRS?.trim() ? parseDirs(env.VANTA_EXTRA_DIRS) : [];
  return [...base, ...extra];
}

/**
 * Add a directory to the session's extra dirs (readable + writable).
 * Mutates process.env.VANTA_EXTRA_DIRS. The kernel still gates each access.
 */
export function addSessionDir(dir: string, env: NodeJS.ProcessEnv): void {
  const abs = resolve(expandHome(dir));
  const current = env.VANTA_EXTRA_DIRS?.trim() ? parseDirs(env.VANTA_EXTRA_DIRS) : [];
  if (!current.includes(abs)) {
    env.VANTA_EXTRA_DIRS = [...current, abs].join(",");
  }
}

/** List currently active extra session dirs. */
export function getSessionDirs(env: NodeJS.ProcessEnv): string[] {
  return env.VANTA_EXTRA_DIRS?.trim() ? parseDirs(env.VANTA_EXTRA_DIRS) : [];
}

/** True if `abs` (an absolute path) is inside one of the zones. */
export function isInZone(abs: string, zones: string[]): boolean {
  return zones.some((z) => abs === z || abs.startsWith(z + sep));
}

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
