import { promises as fsp, type Stats } from "node:fs";
import path from "node:path";

/**
 * Every renderer-supplied path the read-only file and git handlers touch goes through here. A path is usable
 * only when its realpath is inside the active project root, so `..`, absolute escapes and symlinks that point
 * out of the project all fail the same check. Secret-bearing locations are refused even inside the project.
 */

export type GuardCode = "denied" | "invalid" | "missing" | "not-dir" | "not-file" | "outside" | "unreadable";

export interface GuardError {
  code: GuardCode;
  message: string;
}

export type Guarded<T> = { error: GuardError; ok: false } | { ok: true; value: T };

export interface ResolvedPath {
  /** Lexical absolute path in the spelling the renderer used; what listings are built from. */
  abs: string;
  isDirectory: boolean;
  /** Realpath. Open this, not `abs`. */
  real: string;
  /** Realpath relative to the project root, POSIX separators. Empty for the root itself. */
  rel: string;
  stat: Stats;
}

export type PathKind = "any" | "dir" | "file";

export interface GuardDeps {
  /** Extra absolute directories that are never readable (VANTA_HOME, the app's userData). */
  deniedRoots?: () => string[];
  root: () => string;
}

const MAX_PATH_LENGTH = 4096;

const SECRET_DIRECTORIES = new Set([
  ".aws",
  ".azure",
  ".docker",
  ".gnupg",
  ".hermes",
  ".kube",
  ".ssh",
  ".vanta"
]);

const SECRET_FILES = [
  /^\.env(?:\.|$)/i,
  /^\.(?:git-credentials|htpasswd|netrc|npmrc|pgpass|pypirc)$/i,
  /^id_(?:dsa|ecdsa|ed25519|rsa)(?:\.pub)?$/i,
  /(?:^|[-_.])(?:credential|credentials|secret|secrets)(?:[-_.]|$)/i,
  /\.(?:jks|kdbx|key|keystore|p12|pem|pfx|tfstate)$/i
];

const GIT_DIRECTORY = ".git";

export function isSecretName(name: string, isDirectory = false): boolean {
  if (isDirectory) {
    return SECRET_DIRECTORIES.has(name) || name === GIT_DIRECTORY;
  }

  return SECRET_FILES.some(pattern => pattern.test(name));
}

/** True when any segment of a project-relative path is a secret file or directory. */
export function isSecretPath(rel: string): boolean {
  return rel
    .split("/")
    .filter(Boolean)
    .some(segment => isSecretName(segment, true) || isSecretName(segment));
}

const fail = (code: GuardCode, message: string): { error: GuardError; ok: false } => ({
  error: { code, message },
  ok: false
});

const inside = (parent: string, child: string): boolean => child === parent || child.startsWith(`${parent}${path.sep}`);

function toPosix(rel: string): string {
  return rel.split(path.sep).join("/");
}

function lexicalCandidate(raw: unknown, root: string): Guarded<string> {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_PATH_LENGTH || raw.includes("\0")) {
    return fail("invalid", "That is not a usable file path.");
  }

  if (raw.split(/[\\/]/).includes("..")) {
    return fail("outside", "Paths with .. are not allowed. Use a path inside the project.");
  }

  return { ok: true, value: path.isAbsolute(raw) ? path.normalize(raw) : path.join(root, raw) };
}

async function realOf(target: string): Promise<Guarded<string>> {
  try {
    return { ok: true, value: await fsp.realpath(target) };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    return code === "ENOENT" || code === "ENOTDIR"
      ? fail("missing", "That path does not exist.")
      : fail("unreadable", "That path could not be read.");
  }
}

function checkKind(kind: PathKind, stat: Stats): null | { error: GuardError; ok: false } {
  if (kind === "dir" && !stat.isDirectory()) {
    return fail("not-dir", "That path is not a folder.");
  }

  if (kind === "file" && !stat.isFile()) {
    return fail("not-file", "That path is not a regular file.");
  }

  return null;
}

export interface ProjectGuard {
  resolve: (raw: unknown, kind?: PathKind) => Promise<Guarded<ResolvedPath>>;
  /** The realpath of the current project root, or null when it is gone. */
  rootReal: () => Promise<null | string>;
}

interface Located {
  candidate: string;
  real: string;
}

/** The lexical and real location of `raw`, if it exists and its realpath is inside the root. */
async function locate(root: string, raw: unknown): Promise<Guarded<Located>> {
  const candidate = lexicalCandidate(raw, root);

  if (candidate.ok === false) {
    return candidate;
  }

  const real = await realOf(candidate.value);

  if (real.ok === false) {
    return real;
  }

  return inside(root, real.value)
    ? { ok: true, value: { candidate: candidate.value, real: real.value } }
    : fail("outside", "That path is outside the project, so Vanta will not read it.");
}

/** True when the path, as requested or as it really resolves, is a secret location. */
function isSecretLocation(root: string, { candidate, real }: Located): boolean {
  const requestedRel = toPosix(path.relative(root, candidate));

  return isSecretPath(toPosix(path.relative(root, real))) || (!requestedRel.startsWith("..") && isSecretPath(requestedRel));
}

function describe(root: string, { candidate, real }: Located, stat: Stats): ResolvedPath {
  return { abs: candidate, isDirectory: stat.isDirectory(), real, rel: toPosix(path.relative(root, real)), stat };
}

export function createProjectGuard(deps: GuardDeps): ProjectGuard {
  const rootReal = async (): Promise<null | string> => {
    const resolved = await realOf(deps.root());

    return resolved.ok ? resolved.value : null;
  };

  const inDeniedRoot = async (real: string): Promise<boolean> => {
    const roots = await Promise.all((deps.deniedRoots?.() ?? []).map(entry => realOf(entry)));

    return roots.some(entry => entry.ok && inside(entry.value, real));
  };

  const resolve = async (raw: unknown, kind: PathKind = "any"): Promise<Guarded<ResolvedPath>> => {
    const root = await rootReal();

    if (!root) {
      return fail("missing", "The project folder is not available.");
    }

    const found = await locate(root, raw);

    if (found.ok === false) {
      return found;
    }

    if (isSecretLocation(root, found.value) || (await inDeniedRoot(found.value.real))) {
      return fail("denied", "That file can hold secrets, so Vanta will not show it.");
    }

    const stat = await fsp.stat(found.value.real).catch(() => null);

    if (!stat) {
      return fail("unreadable", "That path could not be read.");
    }

    return checkKind(kind, stat) ?? { ok: true, value: describe(root, found.value, stat) };
  };

  return { resolve, rootReal };
}
