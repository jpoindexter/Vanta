// Back-compat for the Argo→Vanta rename. Existing setups have ARGO_* env vars
// (in their shell or argo-ts/.env); the code now reads VANTA_*. This mirrors any
// legacy ARGO_* onto its VANTA_* equivalent — only when the new name is unset, so
// an explicit VANTA_* always wins. Call once at startup, right after loading .env.
// Remove once no ARGO_* configs remain in the wild.

const LEGACY_PREFIX = "ARGO_";
const NEW_PREFIX = "VANTA_";

/** Mirror legacy ARGO_* vars onto VANTA_* (new name wins). Mutates `env`. Pure logic, tested. */
export function mirrorLegacyEnv(env: NodeJS.ProcessEnv = process.env): void {
  for (const key of Object.keys(env)) {
    if (!key.startsWith(LEGACY_PREFIX)) continue;
    const renamed = NEW_PREFIX + key.slice(LEGACY_PREFIX.length);
    if (env[renamed] === undefined && env[key] !== undefined) env[renamed] = env[key];
  }
}
