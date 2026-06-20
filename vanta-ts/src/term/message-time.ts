// Pure, injected-now compact timestamp labels for transcript rows. The render
// layer (ui/transcript.tsx) decides WHERE to show the label; this module only
// decides WHAT the label is. No `new Date()`/`Date.now()` — `nowMs` is a param —
// so the formatter is fully deterministic and unit-testable. Off by default:
// timestampsEnabled(env) is false unless VANTA_MSG_TIMESTAMPS=1, matching the
// current no-timestamp behavior.

/** How a timestamp renders. `off` = never show one (current behavior). */
export type TimestampStyle = "relative" | "absolute" | "off";

const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Pad a small integer to two digits ("4" → "04") for HH:MM. */
const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

/** Local "HH:MM" for an epoch-ms instant. */
function absoluteHhMm(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Local "Mon D" (e.g. "Jun 3") for an epoch-ms instant. */
function absoluteMonthDay(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/**
 * The compact timestamp label for one transcript row.
 *
 * - relative style (default): "just now" (<60s), "Nm ago" (<1h), "Nh ago"
 *   (same day), else "HH:MM" same-day-older / "MMM D" for >1 day.
 * - absolute style: always "HH:MM" within a day, "MMM D" for >1 day.
 *
 * `nowMs` is injected (no clock read here). A future event (nowMs < eventMs)
 * clamps to "just now" rather than printing a negative age.
 */
export function formatMessageTime(
  eventMs: number,
  nowMs: number,
  style: TimestampStyle = "relative",
): string {
  if (style === "off") return "";
  const age = Math.max(0, nowMs - eventMs);

  if (age >= ONE_DAY_MS) return absoluteMonthDay(eventMs);
  if (style === "absolute") return absoluteHhMm(eventMs);

  if (age < ONE_MINUTE_MS) return "just now";
  if (age < ONE_HOUR_MS) return `${Math.floor(age / ONE_MINUTE_MS)}m ago`;
  if (age < ONE_DAY_MS) return `${Math.floor(age / ONE_HOUR_MS)}h ago`;
  return absoluteHhMm(eventMs);
}

/** Per-message timestamps are off unless VANTA_MSG_TIMESTAMPS=1. */
export function timestampsEnabled(env: Record<string, string | undefined>): boolean {
  return env.VANTA_MSG_TIMESTAMPS === "1";
}

/**
 * Resolve the timestamp style from env. Off unless enabled; when enabled,
 * VANTA_MSG_TIMESTAMP_STYLE picks "absolute" (else "relative").
 */
export function resolveTimestampStyle(
  env: Record<string, string | undefined>,
): TimestampStyle {
  if (!timestampsEnabled(env)) return "off";
  return env.VANTA_MSG_TIMESTAMP_STYLE === "absolute" ? "absolute" : "relative";
}
