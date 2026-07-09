import { execFile } from "node:child_process";
import { isSecretInScope, loadGrants, type SecretGrant } from "./scope.js";

// SecretProvider port — fetch a secret AT USE TIME instead of persisting
// plaintext. Mirrors api-key-helper.ts (external command + in-memory TTL cache),
// generalized to a swap-by-env backend. Rule zero: a resolved secret NEVER
// touches disk — it lives only in the process-memory cache below.

const DEFAULT_TTL_MS = 5 * 60 * 1000;

/** A backend that resolves a secret reference to its value at call time. */
export interface SecretProvider {
  /** Backend id (matches a SECRET_CATALOG entry). */
  id: string;
  /** Resolve a reference, e.g. "OPENAI_API_KEY" or "op://vault/item". */
  get(ref: string): Promise<string | null>;
}

export class SecretScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretScopeError";
  }
}

/** How a backend fetches a secret: an env var, a CLI, or the macOS keychain. */
export type SecretKind = "env" | "cli" | "keychain";

/** Catalog entry the setup wizard/doctor read (mirrors providers/catalog.ts). */
export interface SecretBackend {
  id: string;
  label: string;
  kind: SecretKind;
  /** False = listed but not yet wired (no fake adapter is returned). */
  implemented: boolean;
  setupSteps: string[];
  whatItDoes: string;
}

export const SECRET_CATALOG: SecretBackend[] = [
  {
    id: "env",
    label: "Environment variable",
    kind: "env",
    implemented: true,
    whatItDoes: "Reads the secret from process.env at use time (no manager).",
    setupSteps: ["Export the secret in your shell or .env (e.g. OPENAI_API_KEY=…)."],
  },
  {
    id: "bitwarden",
    label: "Bitwarden CLI",
    kind: "cli",
    implemented: true,
    whatItDoes: "Fetches the secret from Bitwarden via `bw get password <ref>`.",
    setupSteps: [
      "Install the Bitwarden CLI: npm i -g @bitwarden/cli",
      "Log in and unlock: `bw login` then `export BW_SESSION=$(bw unlock --raw)`.",
      "Set VANTA_SECRET_BACKEND=bitwarden; reference items by name/id.",
    ],
  },
  {
    id: "1password",
    label: "1Password CLI",
    kind: "cli",
    implemented: true,
    whatItDoes: "Fetches the secret from 1Password via `op read <ref>`.",
    setupSteps: [
      "Install the 1Password CLI (op) and sign in: `op signin`.",
      "Set VANTA_SECRET_BACKEND=1password; reference secrets as op://vault/item/field.",
    ],
  },
  {
    id: "keychain",
    label: "macOS Keychain",
    kind: "keychain",
    implemented: true,
    whatItDoes: "Reads a generic password from the macOS Keychain by service name.",
    setupSteps: [
      "Store the secret: `security add-generic-password -s <ref> -a vanta -w`.",
      "Set VANTA_SECRET_BACKEND=keychain; reference secrets by their service name.",
    ],
  },
];

/** A backend by id, or undefined. Pure. */
export function secretBackendById(id: string): SecretBackend | undefined {
  return SECRET_CATALOG.find((b) => b.id === id);
}

/** Run a command, returning trimmed stdout or null on any failure (errors-as-values). */
export type ExecFn = (cmd: string, args: string[]) => Promise<string | null>;

/** Default exec: execFile (no shell — args are not interpolated into a string). */
export const defaultExec: ExecFn = (cmd, args) =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout: 15_000 }, (err, stdout) => {
      if (err) resolve(null);
      else resolve(stdout.trim() || null);
    });
  });

type CacheEntry = { value: string; expiresAt: number };

/** A process-memory TTL cache keyed by ref. Plaintext stays here only. */
function makeCache(): { get(ref: string): string | null; set(ref: string, v: string): void } {
  const store = new Map<string, CacheEntry>();
  return {
    get(ref) {
      const e = store.get(ref);
      if (e && e.expiresAt > Date.now()) return e.value;
      return null;
    },
    set(ref, v) {
      store.set(ref, { value: v, expiresAt: Date.now() + DEFAULT_TTL_MS });
    },
  };
}

/** The env adapter: reads process.env[ref]. Pure-ish (reads the injected env). */
export function envProvider(env: NodeJS.ProcessEnv): SecretProvider {
  return {
    id: "env",
    async get(ref) {
      return env[ref] ?? null;
    },
  };
}

/** Build a CLI-backed provider from an id + an argv builder. Caches; never persists. */
export function cliProvider(
  id: string,
  toArgs: (ref: string) => { cmd: string; args: string[] },
  exec: ExecFn = defaultExec,
): SecretProvider {
  const cache = makeCache();
  return {
    id,
    async get(ref) {
      const hit = cache.get(ref);
      if (hit !== null) return hit;
      const { cmd, args } = toArgs(ref);
      const value = await exec(cmd, args);
      if (value !== null) cache.set(ref, value);
      return value;
    },
  };
}

/** `bw get password <ref>`. */
export function bitwardenProvider(exec: ExecFn = defaultExec): SecretProvider {
  return cliProvider("bitwarden", (ref) => ({ cmd: "bw", args: ["get", "password", ref] }), exec);
}

/** `op read <ref>`. */
export function onePasswordProvider(exec: ExecFn = defaultExec): SecretProvider {
  return cliProvider("1password", (ref) => ({ cmd: "op", args: ["read", ref] }), exec);
}

/** `security find-generic-password -s <ref> -w` (macOS). */
export function keychainProvider(exec: ExecFn = defaultExec): SecretProvider {
  return cliProvider(
    "keychain",
    (ref) => ({ cmd: "security", args: ["find-generic-password", "-s", ref, "-w"] }),
    exec,
  );
}

/** Pick the backend from VANTA_SECRET_BACKEND (default "env"). exec is injectable for tests. */
export function resolveSecretProvider(env: NodeJS.ProcessEnv, exec: ExecFn = defaultExec): SecretProvider {
  switch (env.VANTA_SECRET_BACKEND ?? "env") {
    case "bitwarden":
      return bitwardenProvider(exec);
    case "1password":
      return onePasswordProvider(exec);
    case "keychain":
      return keychainProvider(exec);
    default:
      return envProvider(env);
  }
}

/** Resolve a secret: process.env first (cheap, already present), else the configured backend. */
export async function getSecret(
  ref: string,
  env: NodeJS.ProcessEnv,
  exec: ExecFn = defaultExec,
): Promise<string | null> {
  if (env[ref]) return env[ref] ?? null;
  return resolveSecretProvider(env, exec).get(ref);
}

export const ACTIVE_SECRET_SCOPE_ENV = "VANTA_SECRET_SCOPE";

export const GLOBAL_SECRET_ENV_ALLOWLIST = new Set([
  "VANTA_SECRET_BACKEND",
  "VANTA_HOME",
]);

export type ScopedSecretOptions = {
  scope?: string | null;
  grants?: readonly SecretGrant[];
  globalAllowlist?: ReadonlySet<string>;
};

function activeScope(env: NodeJS.ProcessEnv, explicit?: string | null): string | null {
  return (explicit ?? env[ACTIVE_SECRET_SCOPE_ENV] ?? "").trim() || null;
}

function assertScopeAllows(
  ref: string,
  scope: string,
  grants: readonly SecretGrant[],
  globalAllowlist: ReadonlySet<string>,
): void {
  if (globalAllowlist.has(ref)) return;
  if (isSecretInScope(grants, ref, scope)) return;
  throw new SecretScopeError(`Secret "${ref}" is not granted to active scope "${scope}".`);
}

/**
 * Scope-aware secret lookup. Without an active scope it preserves legacy
 * getSecret behavior; with VANTA_SECRET_SCOPE (or opts.scope), it checks grants
 * before touching process.env or any backend. Missing/corrupt grants therefore
 * fail closed instead of leaking a raw env var into another run.
 */
export async function getScopedSecret(
  ref: string,
  env: NodeJS.ProcessEnv,
  exec: ExecFn = defaultExec,
  opts: ScopedSecretOptions = {},
): Promise<string | null> {
  const scope = activeScope(env, opts.scope);
  if (!scope) return getSecret(ref, env, exec);
  const grants = opts.grants ?? await loadGrants(env);
  assertScopeAllows(ref, scope, grants, opts.globalAllowlist ?? GLOBAL_SECRET_ENV_ALLOWLIST);
  return resolveSecretProvider(env, exec).get(ref);
}
