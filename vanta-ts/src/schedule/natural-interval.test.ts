import { describe, it, expect } from "vitest";
import { parseNaturalInterval } from "./natural-interval.js";

/** Narrow to a successful parse, failing loudly with the error otherwise. */
function ok(text: string): { cron: string; task: string } {
  const r = parseNaturalInterval(text);
  if ("error" in r) throw new Error(`expected parse, got error: ${r.error}`);
  return r;
}

describe("parseNaturalInterval — every N units", () => {
  it("parses 'every 2 hours <task>' to a stepped-hour cron with the task", () => {
    expect(ok("every 2 hours water the plants")).toEqual({
      cron: "0 */2 * * *",
      task: "water the plants",
    });
  });

  it("parses 'every 30 minutes' to a stepped-minute cron", () => {
    expect(ok("every 30 minutes ping the build").cron).toBe("*/30 * * * *");
  });

  it("parses 'every 3 days' to a stepped day-of-month cron", () => {
    expect(ok("every 3 days backup").cron).toBe("0 0 */3 * *");
  });

  it("accepts the singular unit form ('every 1 hour')", () => {
    expect(ok("every 1 hour check").cron).toBe("0 */1 * * *");
  });
});

describe("parseNaturalInterval — shorthands", () => {
  it("parses 'hourly' to top-of-hour cron", () => {
    expect(ok("hourly sweep logs")).toEqual({ cron: "0 * * * *", task: "sweep logs" });
  });

  it("parses 'daily' to midnight cron", () => {
    expect(ok("daily digest").cron).toBe("0 0 * * *");
  });
});

describe("parseNaturalInterval — every day [at HH:MM]", () => {
  it("parses 'every day' to midnight", () => {
    expect(ok("every day standup").cron).toBe("0 0 * * *");
  });

  it("parses 'every day at 9:00' to 09:00", () => {
    expect(ok("every day at 9:00 standup")).toEqual({ cron: "0 9 * * *", task: "standup" });
  });

  it("parses 'every day at 23:30'", () => {
    expect(ok("every day at 23:30 wind down").cron).toBe("30 23 * * *");
  });

  it("rejects an out-of-range time", () => {
    const r = parseNaturalInterval("every day at 25:00 nope");
    expect("error" in r && r.error).toMatch(/unparseable time/);
  });
});

describe("parseNaturalInterval — every <weekday>", () => {
  it("parses 'every monday' to Monday-midnight cron", () => {
    expect(ok("every monday plan the week")).toEqual({ cron: "0 0 * * 1", task: "plan the week" });
  });

  it("parses 'every sunday' to dow 0", () => {
    expect(ok("every sunday review").cron).toBe("0 0 * * 0");
  });

  it("parses 'every friday' to dow 5", () => {
    expect(ok("every friday ship").cron).toBe("0 0 * * 5");
  });
});

describe("parseNaturalInterval — errors (no schedule)", () => {
  it("errors on empty input", () => {
    const r = parseNaturalInterval("");
    expect("error" in r && r.error).toMatch(/empty interval/);
  });

  it("errors on whitespace-only input", () => {
    expect("error" in parseNaturalInterval("   ")).toBe(true);
  });

  it("errors on garbage", () => {
    const r = parseNaturalInterval("flibbertigibbet nonsense");
    expect("error" in r && r.error).toMatch(/unrecognized interval/);
  });

  it("errors on an unknown 'every' unit", () => {
    const r = parseNaturalInterval("every 5 fortnights do thing");
    expect("error" in r && r.error).toMatch(/unknown interval unit/);
  });

  it("errors on an unparseable 'every' phrase", () => {
    const r = parseNaturalInterval("every blarg");
    expect("error" in r && r.error).toMatch(/could not parse interval/);
  });

  it("errors on an out-of-range step (every 90 minutes)", () => {
    const r = parseNaturalInterval("every 90 minutes x");
    expect("error" in r && r.error).toMatch(/out of range/);
  });

  it("treats a missing task as an empty task (caller enforces non-empty)", () => {
    expect(ok("every 2 hours").task).toBe("");
  });
});
