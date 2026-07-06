import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";

// PCLIP-SCOPED-SECRETS — a named secret reaches a run ONLY when it is scoped to
// that run. The grant model maps secretName → the run scopes allowed to resolve
// it ("session", "loop:<id>", "agent:<id>", or "*" for instance-wide); a run
// resolves only its granted names, so a secret never enters another run's
// resolution set (and thus never its prompt/logs — redactForLog handles the
// value shape; this decides EXPOSURE). Pure model + a tolerant JSON store.

export const SecretGrantSchema = z.object({
  /** The secret's reference name (matches what the SecretProvider resolves). */
  name: z.string().min(1),
  /** Run scopes allowed to resolve it. "*" = instance-wide; else exact scope ids. */
  scopes: z.array(z.string().min(1)).min(1),
});
export type SecretGrant = z.infer<typeof SecretGrantSchema>;

const StoreSchema = z.object({ version: z.literal(1), grants: z.array(SecretGrantSchema) });

export function scopesPath(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "secret-scopes.json");
}

/** Tolerant load: missing/corrupt → no grants (fail CLOSED — nothing is exposed). */
export async function loadGrants(env: NodeJS.ProcessEnv = process.env): Promise<SecretGrant[]> {
  try {
    const parsed = StoreSchema.safeParse(JSON.parse(await readFile(scopesPath(env), "utf8")));
    return parsed.success ? parsed.data.grants : [];
  } catch {
    return [];
  }
}

export async function saveGrants(grants: SecretGrant[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await mkdir(resolveVantaHome(env), { recursive: true });
  await writeFile(scopesPath(env), `${JSON.stringify({ version: 1, grants }, null, 2)}\n`, "utf8");
}

/** Whether `grant` authorizes resolution in `scope` ("*" matches any scope). Pure. */
export function grantCoversScope(grant: SecretGrant, scope: string): boolean {
  return grant.scopes.includes("*") || grant.scopes.includes(scope);
}

/**
 * The set of secret names a run scope may resolve. A name absent from every
 * grant, or granted only to OTHER scopes, is excluded — so it never enters this
 * run's resolution set. Pure.
 */
export function secretsForScope(grants: readonly SecretGrant[], scope: string): Set<string> {
  return new Set(grants.filter((g) => grantCoversScope(g, scope)).map((g) => g.name));
}

/**
 * Filter a set of candidate secret names to those the scope is granted. The
 * injection allowlist: a run is offered ONLY its scoped secrets, never the
 * instance's full set. Pure, order-preserving.
 */
export function filterInjectable(candidates: readonly string[], grants: readonly SecretGrant[], scope: string): string[] {
  const allowed = secretsForScope(grants, scope);
  return candidates.filter((name) => allowed.has(name));
}

/** True when `scope` may resolve `name` (the single-name gate). Pure. */
export function isSecretInScope(grants: readonly SecretGrant[], name: string, scope: string): boolean {
  return grants.some((g) => g.name === name && grantCoversScope(g, scope));
}

/** Add or extend a grant (merge scopes for an existing name). Pure. */
export function grantSecret(grants: readonly SecretGrant[], name: string, scope: string): SecretGrant[] {
  const existing = grants.find((g) => g.name === name);
  if (!existing) return [...grants, { name, scopes: [scope] }];
  if (existing.scopes.includes(scope)) return [...grants];
  return grants.map((g) => (g.name === name ? { ...g, scopes: [...g.scopes, scope] } : g));
}
