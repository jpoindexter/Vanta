// TOOL-RETRY — early fail-detect + SAFE auto-retry + honest report. A failed
// tool call is retried only when (a) the tool is idempotent (a read with no
// extra side effect on re-run) and (b) the failure looks transient (network /
// timeout / rate-limit). Writes, commits, shell, run_code, and agent-spawns
// NEVER auto-retry — re-running them could double a side effect. A non-transient
// failure (ENOENT, parse error) isn't retried either: it won't fix itself.
// Default = no retry, so any tool not on the list is safe.

/** Idempotent, read-only tools that can be safely re-run. New tools default off. */
const RETRYABLE_TOOLS = new Set<string>([
  "read_file", "recall", "inspect_state", "graph_query",
  "web_fetch", "web_search",
  "git_status", "git_diff",
  "lsp_diagnostics", "lsp_definition",
  "gmail_search", "gmail_read", "calendar_read", "drive_read",
  "describe_image", "look_at_screen", "look_at_camera",
  "browser_navigate", "browser_extract", "screenshot",
  "transcribe", "watch_video",
]);

/** Failure shapes that a retry can plausibly clear (network / transient I/O). */
const TRANSIENT = /(ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|EPIPE|socket hang up|timed?\s?out|timeout|temporarily|rate[\s-]?limit|too many requests|\b(429|500|502|503|504)\b|network error|connection (reset|refused|closed)|fetch failed)/i;

export function isRetryableTool(name: string): boolean {
  return RETRYABLE_TOOLS.has(name);
}

/** A transient failure = the call did not succeed AND the error reads as transient. */
export function isTransientFailure(ok: boolean, output: string): boolean {
  return !ok && TRANSIENT.test(output);
}

/** Auto-retry only when the tool is idempotent and the failure is transient. */
export function shouldRetryTool(name: string, ok: boolean, output: string): boolean {
  return isRetryableTool(name) && isTransientFailure(ok, output);
}

/** Retry budget from env (default 1, clamped 0..5). */
export function resolveToolRetries(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.VANTA_TOOL_RETRIES);
  if (!Number.isFinite(raw)) return 1;
  return Math.max(0, Math.min(5, Math.trunc(raw)));
}

/** True when an error (any shape, incl. its cause) reads as a transient/retryable failure. */
export function isTransientError(err: unknown): boolean {
  const cause = err instanceof Error && err.cause ? ` ${err.cause instanceof Error ? `${err.cause.name} ${err.cause.message}` : String(err.cause)}` : "";
  const text = err instanceof Error ? `${err.name} ${err.message}${cause}` : String(err);
  return TRANSIENT.test(text);
}

/** Provider-call retry budget from env (default 2, clamped 0..5). A long run makes many model
 * calls; a transient hiccup on one shouldn't crash the whole run. */
export function resolveProviderRetries(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.VANTA_PROVIDER_RETRIES);
  if (!Number.isFinite(raw)) return 2;
  return Math.max(0, Math.min(5, Math.trunc(raw)));
}
