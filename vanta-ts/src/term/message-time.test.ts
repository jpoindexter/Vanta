import { describe, it, expect } from "vitest";
import {
  formatMessageTime,
  timestampsEnabled,
  resolveTimestampStyle,
} from "./message-time.js";

// A fixed anchor for "now". Event times are derived by subtracting an offset,
// so relative outputs are exact and absolute outputs are timezone-stable
// (we read HH:MM / MMM D back off the same local Date the formatter uses).
const NOW = 1_700_000_000_000; // arbitrary fixed instant
const SEC = 1_000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const hhmm = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};
const monthDay = (ms: number): string => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const d = new Date(ms);
  return `${months[d.getMonth()]} ${d.getDate()}`;
};

describe("formatMessageTime — relative (default)", () => {
  it("shows 'just now' under 60s", () => {
    expect(formatMessageTime(NOW - 5 * SEC, NOW)).toBe("just now");
    expect(formatMessageTime(NOW - 59 * SEC, NOW)).toBe("just now");
  });

  it("shows 'Nm ago' within the hour", () => {
    expect(formatMessageTime(NOW - 5 * MIN, NOW)).toBe("5m ago");
    expect(formatMessageTime(NOW - 1 * MIN, NOW)).toBe("1m ago");
    expect(formatMessageTime(NOW - 59 * MIN, NOW)).toBe("59m ago");
  });

  it("shows 'Nh ago' within the day", () => {
    expect(formatMessageTime(NOW - 2 * HOUR, NOW)).toBe("2h ago");
    expect(formatMessageTime(NOW - 23 * HOUR, NOW)).toBe("23h ago");
  });

  it("shows absolute HH:MM for same-window older-than-a-few-hours but under a day", () => {
    // boundary: exactly 1h → "1h ago" (relative window), still within a day
    expect(formatMessageTime(NOW - 1 * HOUR, NOW)).toBe("1h ago");
  });

  it("shows 'MMM D' for events older than one day", () => {
    const event = NOW - 2 * DAY;
    expect(formatMessageTime(event, NOW)).toBe(monthDay(event));
  });

  it("at exactly one day, switches to the absolute date", () => {
    const event = NOW - DAY;
    expect(formatMessageTime(event, NOW)).toBe(monthDay(event));
  });

  it("clamps a future event to 'just now' (never a negative age)", () => {
    expect(formatMessageTime(NOW + 10 * MIN, NOW)).toBe("just now");
  });
});

describe("formatMessageTime — absolute style", () => {
  it("forces HH:MM for sub-day events regardless of recency", () => {
    const event = NOW - 5 * MIN;
    expect(formatMessageTime(event, NOW, "absolute")).toBe(hhmm(event));
  });

  it("forces HH:MM even for an event under a minute old", () => {
    const event = NOW - 5 * SEC;
    expect(formatMessageTime(event, NOW, "absolute")).toBe(hhmm(event));
  });

  it("still shows 'MMM D' for events older than one day", () => {
    const event = NOW - 3 * DAY;
    expect(formatMessageTime(event, NOW, "absolute")).toBe(monthDay(event));
  });
});

describe("formatMessageTime — off", () => {
  it("returns an empty string for any input", () => {
    expect(formatMessageTime(NOW - 5 * MIN, NOW, "off")).toBe("");
    expect(formatMessageTime(NOW - 3 * DAY, NOW, "off")).toBe("");
  });
});

describe("timestampsEnabled", () => {
  it("is off by default (unset)", () => {
    expect(timestampsEnabled({})).toBe(false);
  });
  it("is off for any value other than '1'", () => {
    expect(timestampsEnabled({ VANTA_MSG_TIMESTAMPS: "0" })).toBe(false);
    expect(timestampsEnabled({ VANTA_MSG_TIMESTAMPS: "true" })).toBe(false);
  });
  it("is on for '1'", () => {
    expect(timestampsEnabled({ VANTA_MSG_TIMESTAMPS: "1" })).toBe(true);
  });
});

describe("resolveTimestampStyle", () => {
  it("is 'off' when disabled", () => {
    expect(resolveTimestampStyle({})).toBe("off");
    expect(resolveTimestampStyle({ VANTA_MSG_TIMESTAMP_STYLE: "absolute" })).toBe("off");
  });
  it("defaults to 'relative' when enabled", () => {
    expect(resolveTimestampStyle({ VANTA_MSG_TIMESTAMPS: "1" })).toBe("relative");
  });
  it("is 'absolute' when enabled and style=absolute", () => {
    expect(
      resolveTimestampStyle({ VANTA_MSG_TIMESTAMPS: "1", VANTA_MSG_TIMESTAMP_STYLE: "absolute" }),
    ).toBe("absolute");
  });
  it("is 'relative' for an unknown style value when enabled", () => {
    expect(
      resolveTimestampStyle({ VANTA_MSG_TIMESTAMPS: "1", VANTA_MSG_TIMESTAMP_STYLE: "weird" }),
    ).toBe("relative");
  });
});
