/**
 * Structural secret redaction — a logging formatter that strips secrets by
 * their POSITION, not their vendor shape. Complements `secret-scan.ts`
 * (`redactSecrets`), which matches known vendor-prefixed VALUES (ghp_…, sk-…,
 * Bearer …). Here we redact whatever sits in a secret-bearing SLOT — a URL
 * query token, an auth header value, or a connection-string password — even
 * when the value itself is opaque and unprefixed.
 *
 * Errs toward over-redaction: a logged line matching a credential-carrying
 * structure loses that value, since a false redaction is harmless while a
 * leaked secret is not. Pure, no side effects.
 */

import { redactSecrets } from "./secret-scan.js";

const MASK = "***";

/** Query-string keys whose value is a credential (`?token=…`, `&api_key=…`). */
const QUERY_SECRET_KEYS =
  "access_token|refresh_token|client_secret|id_token|api[_-]?key|apikey|auth_token|authtoken|token|password|passwd|pwd|secret|signature|sig|session_token";

/** Auth/credential HTTP header names whose value must never be logged. */
const SECRET_HEADERS =
  "proxy-authorization|authorization|www-authenticate|x-api-key|x-auth-token|x-amz-security-token|api-key|cookie|set-cookie";

const PATTERNS: ReadonlyArray<{ re: RegExp; replace: string }> = [
  // `?token=abc` / `&api_key=abc` → keep the key, mask the value up to the next
  // param delimiter, whitespace, or quote.
  { re: new RegExp(`([?&](?:${QUERY_SECRET_KEYS})=)[^&\\s"'<>]+`, "gi"), replace: `$1${MASK}` },
  // `Authorization: Bearer abc` / `X-Api-Key: abc` → mask the value to line end
  // (header values run to the end of their record; masking the remainder is the
  // safe structural choice).
  { re: new RegExp(`((?:${SECRET_HEADERS})\\s*:\\s*)[^\\r\\n]+`, "gi"), replace: `$1${MASK}` },
  // `postgres://user:pass@host` → mask the password between `user:` and `@`.
  // The user (may be empty) and host are preserved; only the secret is dropped.
  { re: /([a-z][a-z0-9+.-]*:\/\/[^:/?#\s@]*:)[^@\s/?#]+@/gi, replace: `$1${MASK}@` },
];

/**
 * Redact structural secret slots (URL query credentials, auth headers,
 * connection-string passwords) in `text`. Returns the input unchanged when no
 * structural pattern matches. Pure.
 */
export function redactStructural(text: string): string {
  let out = text;
  for (const { re, replace } of PATTERNS) {
    out = out.replace(re, replace);
  }
  return out;
}

/**
 * The logging formatter: apply BOTH structural redaction (positional slots) and
 * vendor-value redaction (`redactSecrets`) so a log line is safe to persist no
 * matter which way a credential appears. Call this at every emit point that
 * writes free text to a durable log.
 */
export function redactForLog(text: string): string {
  return redactSecrets(redactStructural(text));
}
