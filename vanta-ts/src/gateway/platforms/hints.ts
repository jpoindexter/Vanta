// MSG-PLATFORM-HINTS — per-platform system-prompt formatting hints.
//
// The prompt is platform-agnostic, so the agent over-emits markdown for plain
// surfaces (IRC, ntfy). When a messaging session is active, one short hint per
// platform lets the agent ADAPT formatting before output, rather than the
// host degrading markdown post-hoc. Pure: a static map keyed by platform id
// (mirrors registry.ts ids); `undefined` for an unknown/absent platform so the
// caller can drop the line entirely (default prompt unchanged).

/** One-line formatting hint per messaging-platform id. Keys match registry.ts. */
const PLATFORM_HINTS: Readonly<Record<string, string>> = {
  // Plain-text surfaces — markdown does not render; keep lines short.
  irc: "You're on IRC — no markdown renders, keep lines short and avoid code fences.",
  ntfy: "You're on ntfy push — plain text only, no markdown, keep it to a short line or two.",
  imessage: "You're on iMessage — markdown does not render; write plain prose, no code fences or tables.",
  signal: "You're on Signal — plain text only, no markdown; keep replies short.",
  // Markdown-capable surfaces — restrained markdown is fine.
  telegram: "You're on Telegram — MarkdownV2 is supported; use light markdown (bold, code) but escape reserved chars.",
  mattermost: "You're on Mattermost — full markdown renders; use it sparingly and keep replies chat-length.",
};

/**
 * The one-line formatting hint for a messaging platform (PURE). Returns the
 * hint string for a known platform id, or `undefined` when the id is unknown,
 * empty, or absent — the caller drops the line so the default prompt is
 * unchanged. No I/O, no env reads.
 */
export function platformHint(platformId?: string): string | undefined {
  if (!platformId) return undefined;
  return PLATFORM_HINTS[platformId.trim().toLowerCase()];
}
