/**
 * Client-side secret scanner. Detects high-confidence credential shapes in text
 * before it is persisted/committed to the versioned ~/.vanta store.
 *
 * Design: a SMALL curated set of near-zero-false-positive patterns. We return
 * matched RULE IDS — never the secret values — so a redaction notice can name
 * what was caught without echoing it. Pure module, no side effects.
 */

/** One detection rule: a stable id + the shape that triggers it. */
type SecretRule = { id: string; pattern: RegExp };

/**
 * High-confidence rules. Each pattern is anchored on a vendor prefix + exact
 * length so a normal sentence, a git sha, or a uuid cannot match.
 */
const RULES: readonly SecretRule[] = [
  { id: "github-pat", pattern: /\bghp_[A-Za-z0-9]{36}\b/ },
  { id: "github-fine-grained-pat", pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/ },
  { id: "aws-access-key-id", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: "google-api-key", pattern: /\bAIza[0-9A-Za-z_\-]{35}\b/ },
  // Google OAuth refresh tokens start `1//` followed by a long opaque body.
  { id: "google-refresh-token", pattern: /\b1\/\/[A-Za-z0-9_-]{20,}\b/ },
  {
    id: "private-key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
  },
  // Anthropic keys carry the `sk-ant-` vendor prefix — checked before the
  // generic openai `sk-` rule so the more specific id wins on a match.
  { id: "anthropic-key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { id: "openai-key", pattern: /\bsk-[A-Za-z0-9]{20,}\b/ },
  // Telegram bot tokens are `<numeric-bot-id>:<35-char secret>`.
  { id: "telegram-bot-token", pattern: /\b\d{6,}:[A-Za-z0-9_-]{30,}\b/ },
  // Generic bearer credentials (Authorization: Bearer <token>).
  { id: "bearer-token", pattern: /Bearer [A-Za-z0-9._-]{20,}/ },
];

/**
 * Scan text for known secret shapes. Returns the deduped list of matched RULE
 * IDS (never the matched values). Empty array means clean.
 */
export function scanForSecrets(text: string): string[] {
  const hits = new Set<string>();
  for (const rule of RULES) {
    if (rule.pattern.test(text)) hits.add(rule.id);
  }
  return [...hits];
}

/** True when `text` contains at least one known secret shape. */
export function hasSecrets(text: string): boolean {
  return RULES.some((rule) => rule.pattern.test(text));
}

/**
 * Human-readable redaction notice naming the matched rule ids (not the values).
 * Suitable for logging or returning from a blocked write.
 */
export function formatRedactionNotice(rules: string[]): string {
  return `blocked: content contains secrets [${rules.join(", ")}] — not persisted`;
}

const REDACTION = "[REDACTED]";

// Global-flagged twins of the scan patterns so `.replace` can strip every
// match, not just the first. Built once from the same RULES so the redactor and
// the scanner can never drift apart.
const REDACT_PATTERNS: readonly RegExp[] = RULES.map(
  (rule) => new RegExp(rule.pattern.source, "g"),
);

/**
 * Replace every known secret shape in `text` with `[REDACTED]`. Safe to log:
 * the matched credential values are removed, surrounding text is preserved.
 * Returns the input unchanged when nothing matches.
 */
export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of REDACT_PATTERNS) {
    out = out.replace(pattern, REDACTION);
  }
  return out;
}
