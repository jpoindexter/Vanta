/**
 * Natural-language interval → 5-field cron parser (PURE).
 *
 * Used by the `/loop` slash command: an operator types
 * `/loop every 2 hours <task>` and we turn the leading interval phrase into a
 * standard cron expression, leaving the remainder as the task instruction.
 *
 * Errors are values (`{ error }`) — an unparseable or empty interval never
 * schedules anything; the caller surfaces the message and creates no entry.
 */

/** A parsed interval: the cron expression plus the trailing task text. */
export type ParsedInterval = { cron: string; task: string };

/** Discriminated result: either a parse or a clear error message. */
export type IntervalResult = ParsedInterval | { error: string };

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** "9:00" / "09:5" / "23:59" → {h, m}, or null if out of range / malformed. */
function parseClock(text: string): { h: number; m: number } | null {
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h > 23 || m > 59) return null;
  return { h, m };
}

/** Split a clause into the matched cron and whatever followed it (the task). */
function withTask(cron: string, rest: string[]): ParsedInterval {
  return { cron, task: rest.join(" ").trim() };
}

/** "hourly"/"daily" single-word shorthands → cron + the rest as the task. */
function parseShorthand(words: string[]): ParsedInterval | null {
  const head = words[0];
  if (head === "hourly") return withTask("0 * * * *", words.slice(1));
  if (head === "daily") return withTask("0 0 * * *", words.slice(1));
  return null;
}

/** "every day [at HH:MM]" → daily cron, defaulting to midnight. */
function parseEveryDay(rest: string[]): IntervalResult | null {
  if (rest[0] !== "day") return null;
  if (rest[1] === "at") {
    const clock = parseClock(rest[2] ?? "");
    if (!clock) return { error: `unparseable time "${rest[2] ?? ""}" — use HH:MM (e.g. 9:00)` };
    return withTask(`${clock.m} ${clock.h} * * *`, rest.slice(3));
  }
  return withTask("0 0 * * *", rest.slice(1));
}

/** "every monday" / "every friday" → weekly cron at midnight on that day. */
function parseEveryWeekday(rest: string[]): ParsedInterval | null {
  const dow = WEEKDAYS[rest[0] ?? ""];
  if (dow === undefined) return null;
  return withTask(`0 0 * * ${dow}`, rest.slice(1));
}

/** Per-unit step-cron rule: max step value + a cron builder for step N. */
const STEP_UNITS: Record<string, { max: number; cron: (n: number) => string }> = {
  minute: { max: 59, cron: (n) => `*/${n} * * * *` },
  hour: { max: 23, cron: (n) => `0 */${n} * * *` },
  day: { max: 31, cron: (n) => `0 0 */${n} * *` },
};

/** "every N minutes|hours|days" → stepped cron, or null if not that shape. */
function parseEveryN(rest: string[]): IntervalResult | null {
  const n = Number(rest[0]);
  if (!Number.isInteger(n) || n < 1) return null;
  const unitWord = rest[1] ?? "";
  const rule = STEP_UNITS[unitWord.replace(/s$/, "")];
  if (!rule) return { error: `unknown interval unit "${unitWord}" — use minutes, hours, or days` };
  if (n > rule.max) return { error: `every ${n} ${unitWord} is out of range (max ${rule.max})` };
  return withTask(rule.cron(n), rest.slice(2));
}

/** Dispatch the "every ..." family to the matching shape parser. */
function parseEvery(rest: string[]): IntervalResult {
  const day = parseEveryDay(rest);
  if (day) return day;
  const weekday = parseEveryWeekday(rest);
  if (weekday) return weekday;
  const everyN = parseEveryN(rest);
  if (everyN) return everyN;
  return { error: `could not parse interval "every ${rest.join(" ")}" — try "every 2 hours", "every day at 9:00", or "every monday"` };
}

/**
 * Parse a leading natural-language interval phrase into a 5-field cron plus the
 * remaining task text. Returns `{ error }` (no schedule) on an empty or
 * unparseable interval.
 */
export function parseNaturalInterval(text: string): IntervalResult {
  const words = text.trim().split(/\s+/).filter((w) => w !== "");
  if (words.length === 0) return { error: "empty interval — try `/loop every 2 hours <task>`" };

  const shorthand = parseShorthand(words);
  if (shorthand) return shorthand;

  if (words[0] === "every") return parseEvery(words.slice(1));

  return { error: `unrecognized interval "${words[0]}" — start with "every", "hourly", or "daily"` };
}
