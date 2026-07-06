import { describe, it, expect } from "vitest";
import {
  resolveOutreachConfig,
  decideOutreach,
  recordOutreach,
  silenceOutreach,
  parseOutreachTarget,
  newOutreachState,
  outreachTickText,
  type OutreachConfig,
} from "./outreach.js";

const NOW = new Date("2026-07-06T12:00:00.000Z");

function cfg(over: Partial<OutreachConfig> = {}): OutreachConfig {
  return { enabled: true, to: "telegram:123", minIntervalMin: 30, maxPerDay: 5, budgetScope: "session", ...over };
}

describe("resolveOutreachConfig", () => {
  it("defaults to disabled with no target", () => {
    const c = resolveOutreachConfig({});
    expect(c.enabled).toBe(false);
    expect(c.to).toBe("");
    expect(c.minIntervalMin).toBe(30);
    expect(c.maxPerDay).toBe(5);
    expect(c.budgetScope).toBe("session");
  });

  it("reads VANTA_OUTREACH_* env keys", () => {
    const c = resolveOutreachConfig({
      VANTA_OUTREACH: "1",
      VANTA_OUTREACH_TO: "telegram:42",
      VANTA_OUTREACH_INTERVAL_MIN: "10",
      VANTA_OUTREACH_MAX_PER_DAY: "3",
      VANTA_OUTREACH_BUDGET_SCOPE: "goal:g1",
    });
    expect(c).toEqual({ enabled: true, to: "telegram:42", minIntervalMin: 10, maxPerDay: 3, budgetScope: "goal:g1" });
  });

  it("ignores non-numeric throttle values (keeps defaults)", () => {
    const c = resolveOutreachConfig({ VANTA_OUTREACH_INTERVAL_MIN: "abc" });
    expect(c.minIntervalMin).toBe(30);
  });
});

describe("parseOutreachTarget", () => {
  it("parses platform:chatId", () => {
    expect(parseOutreachTarget("telegram:123456")).toEqual({ platform: "telegram", chatId: "123456" });
  });

  it("keeps colons inside the chat id", () => {
    expect(parseOutreachTarget("matrix:!room:server.org")).toEqual({ platform: "matrix", chatId: "!room:server.org" });
  });

  it.each(["", "telegram", ":123", "telegram:"])("rejects malformed %j", (to) => {
    expect(parseOutreachTarget(to)).toHaveProperty("error");
  });
});

describe("decideOutreach", () => {
  it("refuses when disabled", () => {
    const d = decideOutreach({ config: cfg({ enabled: false }), state: newOutreachState(), now: NOW, budgetExceeded: false });
    expect(d.send).toBe(false);
    expect(d.reason).toContain("disabled");
  });

  it("refuses without a target", () => {
    const d = decideOutreach({ config: cfg({ to: "" }), state: newOutreachState(), now: NOW, budgetExceeded: false });
    expect(d.send).toBe(false);
    expect(d.reason).toContain("no target");
  });

  it("refuses while silenced, allows after the silence expires", () => {
    const silenced = silenceOutreach(newOutreachState(), new Date(NOW.getTime() + 60_000));
    expect(decideOutreach({ config: cfg(), state: silenced, now: NOW, budgetExceeded: false }).send).toBe(false);
    const later = new Date(NOW.getTime() + 120_000);
    expect(decideOutreach({ config: cfg(), state: silenced, now: later, budgetExceeded: false }).send).toBe(true);
  });

  it("refuses when the budget scope is exhausted", () => {
    const d = decideOutreach({ config: cfg(), state: newOutreachState(), now: NOW, budgetExceeded: true });
    expect(d.send).toBe(false);
    expect(d.reason).toContain("budget");
  });

  it("enforces the min interval since the last send", () => {
    const state = recordOutreach(newOutreachState(), new Date(NOW.getTime() - 10 * 60_000));
    const d = decideOutreach({ config: cfg({ minIntervalMin: 30 }), state, now: NOW, budgetExceeded: false });
    expect(d.send).toBe(false);
    expect(d.reason).toContain("cadence");
  });

  it("enforces the daily cap and rolls it on a new day", () => {
    let state = newOutreachState();
    const yesterday = new Date("2026-07-05T12:00:00.000Z");
    for (let i = 0; i < 5; i += 1) state = recordOutreach(state, yesterday);
    // Same day, cap hit (interval satisfied via a large gap):
    const sameDayLater = new Date("2026-07-05T23:00:00.000Z");
    expect(decideOutreach({ config: cfg(), state, now: sameDayLater, budgetExceeded: false }).reason).toContain("daily cap");
    // New day: counter rolls, send allowed.
    expect(decideOutreach({ config: cfg(), state, now: NOW, budgetExceeded: false }).send).toBe(true);
  });

  it("allows when every gate passes", () => {
    expect(decideOutreach({ config: cfg(), state: newOutreachState(), now: NOW, budgetExceeded: false })).toEqual({
      send: true,
      reason: "ok",
    });
  });
});

describe("recordOutreach / silenceOutreach", () => {
  it("stamps lastSentAt and increments the day counter", () => {
    const s1 = recordOutreach(newOutreachState(), NOW);
    expect(s1.lastSentAt).toBe(NOW.toISOString());
    expect(s1.sentToday).toBe(1);
    expect(s1.day).toBe("2026-07-06");
    expect(recordOutreach(s1, NOW).sentToday).toBe(2);
  });

  it("silence sets and clears silencedUntil", () => {
    const until = new Date(NOW.getTime() + 3_600_000);
    const s = silenceOutreach(newOutreachState(), until);
    expect(s.silencedUntil).toBe(until.toISOString());
    expect(silenceOutreach(s, null).silencedUntil).toBeNull();
  });
});

describe("outreachTickText", () => {
  it("pluralizes and names the silence switch", () => {
    expect(outreachTickText(1)).toContain("1 queued loop wake ");
    expect(outreachTickText(3)).toContain("3 queued loop wakes");
    expect(outreachTickText(3)).toContain("vanta proactive silence");
  });
});
