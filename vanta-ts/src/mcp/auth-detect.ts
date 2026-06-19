// Detect the "this MCP server needs OAuth" signal from a connect/initialize/
// listTools failure. The MCP client throws a plain Error whose message carries
// the HTTP status text (see http-transport.ts: `HTTP 401: ...`) or a server
// JSON-RPC error message. We inspect that string — pure, no IO — so the connect
// path can mark a server auth-pending instead of failing it silently.

const AUTH_SIGNALS = [
  "http 401",
  "http 403",
  "401 unauthorized",
  "unauthorized",
  "www-authenticate",
  "invalid_token",
  "authorization required",
  "auth required",
  "authentication required",
  "oauth",
];

/**
 * True when an error message indicates the server requires OAuth/authorization.
 * Matches HTTP 401/403, WWW-Authenticate, and common OAuth error phrasings.
 * Pure — takes the thrown error (or any value) and returns a boolean.
 */
export function isAuthRequiredError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  if (!msg) return false;
  return AUTH_SIGNALS.some((s) => msg.includes(s));
}
