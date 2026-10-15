import { createHash } from "node:crypto";
import type { ServerSpec } from "./mount-config.js";

/**
 * Apply a configured MCP tool policy without erasing operator intent.
 *
 * `undefined` keeps the documented default (all discovered tools), while every
 * array is an explicit allowlist. In particular, `[]` means zero tools.
 */
export function applyMcpToolPolicy<T extends { name: string }>(
  discovered: readonly T[],
  configured: readonly string[] | undefined,
): T[] {
  if (configured === undefined) return [...discovered];
  const allowed = new Set(configured);
  return discovered.filter((tool) => allowed.has(tool.name));
}

/** Apply the same policy to persisted/disclosed tool-name inventories. */
export function applyMcpToolNamePolicy(
  discovered: readonly string[],
  configured: readonly string[] | undefined,
): string[] {
  if (configured === undefined) return [...discovered];
  const allowed = new Set(configured);
  return discovered.filter((name) => allowed.has(name));
}

function optionalIdentityValue<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

/** Bind persisted trust to the exact launch/auth/tool declaration. */
export function mcpTrustDecisionKey(server: string, spec: ServerSpec): string {
  const identity = JSON.stringify({
    command: optionalIdentityValue(spec.command),
    args: spec.args ?? [],
    env: Object.entries(spec.env ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    url: optionalIdentityValue(spec.url),
    token: optionalIdentityValue(spec.token),
    headers: Object.entries(spec.headers ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    authorizationUrl: optionalIdentityValue(spec.authorizationUrl),
    tokenUrl: optionalIdentityValue(spec.tokenUrl),
    clientId: optionalIdentityValue(spec.clientId),
    clientSecret: optionalIdentityValue(spec.clientSecret),
    scope: optionalIdentityValue(spec.scope),
    tools: optionalIdentityValue(spec.tools),
  });
  return `${server}@${createHash("sha256").update(identity).digest("hex").slice(0, 16)}`;
}
