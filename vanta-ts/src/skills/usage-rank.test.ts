import { describe, expect, it } from "vitest";
import {
  HALF_LIFE_MS,
  decayWeight,
  rankSkillsByUsage,
  topUsedSkills,
  usageScore,
  type UsageEvent,
} from "./usage-rank.js";

// A fixed "now" so every test is deterministic — nowMs is injected, never Date.now.
const NOW = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** N skill events at a fixed age (ms before NOW). */
function eventsAt(skill: string, count: number, ageMs: number): UsageEvent[] {
  return Array.from({ length: count }, () => ({ skill, ts: NOW - ageMs }));
}

describe("decayWeight", () => {
  it("returns 1 at age 0 (a just-now event)", () => {
    expect(decayWeight(0)).toBe(1);
  });

  it("returns 0.5 at exactly one half-life", () => {
    expect(decayWeight(HALF_LIFE_MS)).toBeCloseTo(0.5, 10);
  });

  it("returns 0.25 at two half-lives", () => {
    expect(decayWeight(2 * HALF_LIFE_MS)).toBeCloseTo(0.25, 10);
  });

  it("clamps negative age (future event) to weight 1", () => {
    expect(decayWeight(-DAY_MS)).toBe(1);
    expect(decayWeight(-HALF_LIFE_MS * 5)).toBe(1);
  });

  it("decays monotonically as age grows", () => {
    expect(decayWeight(DAY_MS)).toBeGreaterThan(decayWeight(2 * DAY_MS));
    expect(decayWeight(2 * DAY_MS)).toBeGreaterThan(decayWeight(10 * DAY_MS));
  });

  it("honors a custom half-life", () => {
    expect(decayWeight(DAY_MS, DAY_MS)).toBeCloseTo(0.5, 10);
  });
});

describe("usageScore", () => {
  it("sums a skill's decayed events", () => {
    // one event now (1) + one event a half-life ago (0.5) = 1.5
    const events = [...eventsAt("refactor", 1, 0), ...eventsAt("refactor", 1, HALF_LIFE_MS)];
    expect(usageScore(events, "refactor", NOW)).toBeCloseTo(1.5, 10);
  });

  it("ignores other skills' events", () => {
    const events = [...eventsAt("refactor", 3, 0), ...eventsAt("debug", 5, 0)];
    expect(usageScore(events, "refactor", NOW)).toBeCloseTo(3, 10);
  });

  it("scores 0 for a skill with no events", () => {
    expect(usageScore(eventsAt("debug", 2, 0), "refactor", NOW)).toBe(0);
  });

  it("scores 0 over an empty log", () => {
    expect(usageScore([], "refactor", NOW)).toBe(0);
  });
});

describe("rankSkillsByUsage", () => {
  it("orders by score descending", () => {
    const events = [...eventsAt("a", 1, 0), ...eventsAt("b", 3, 0), ...eventsAt("c", 2, 0)];
    expect(rankSkillsByUsage(["a", "b", "c"], events, NOW)).toEqual(["b", "c", "a"]);
  });

  it("breaks ties alphabetically", () => {
    // all used once just now → equal scores → alphabetical
    const events = [...eventsAt("c", 1, 0), ...eventsAt("a", 1, 0), ...eventsAt("b", 1, 0)];
    expect(rankSkillsByUsage(["c", "a", "b"], events, NOW)).toEqual(["a", "b", "c"]);
  });

  it("recent-heavy beats old-heavy at equal raw counts", () => {
    // both used 3 times: recent = 3 events now, stale = 3 events two half-lives ago
    const events = [...eventsAt("recent", 3, 0), ...eventsAt("stale", 3, 2 * HALF_LIFE_MS)];
    expect(rankSkillsByUsage(["recent", "stale"], events, NOW)).toEqual(["recent", "stale"]);
  });

  it("places no-usage skills in a trailing alphabetical block", () => {
    const events = eventsAt("used", 2, 0);
    // unused skills (score 0) trail, in alphabetical order, after the used one
    expect(rankSkillsByUsage(["zeta", "used", "alpha"], events, NOW)).toEqual([
      "used",
      "alpha",
      "zeta",
    ]);
  });

  it("falls back to alphabetical when there is no usage at all", () => {
    expect(rankSkillsByUsage(["gamma", "alpha", "beta"], [], NOW)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  it("does not mutate the input array", () => {
    const names = ["b", "a"];
    rankSkillsByUsage(names, eventsAt("a", 1, 0), NOW);
    expect(names).toEqual(["b", "a"]);
  });
});

describe("topUsedSkills", () => {
  it("returns the top-N skills by score, used ones only", () => {
    const events = [
      ...eventsAt("a", 1, 0),
      ...eventsAt("b", 5, 0),
      ...eventsAt("c", 3, 0),
      ...eventsAt("d", 2, 0),
    ];
    expect(topUsedSkills(events, NOW, 2)).toEqual(["b", "c"]);
  });

  it("caps at N", () => {
    const events = [...eventsAt("a", 1, 0), ...eventsAt("b", 1, 0), ...eventsAt("c", 1, 0)];
    expect(topUsedSkills(events, NOW, 2)).toHaveLength(2);
  });

  it("defaults to 5", () => {
    const events = Array.from({ length: 8 }, (_, i) => ({ skill: `s${i}`, ts: NOW - i * DAY_MS }));
    expect(topUsedSkills(events, NOW)).toHaveLength(5);
  });

  it("returns empty for no events", () => {
    expect(topUsedSkills([], NOW)).toEqual([]);
  });

  it("returns empty for n <= 0", () => {
    expect(topUsedSkills(eventsAt("a", 1, 0), NOW, 0)).toEqual([]);
    expect(topUsedSkills(eventsAt("a", 1, 0), NOW, -3)).toEqual([]);
  });

  it("ranks recent usage over older usage", () => {
    const events = [...eventsAt("recent", 2, DAY_MS), ...eventsAt("old", 2, 6 * DAY_MS)];
    expect(topUsedSkills(events, NOW, 2)).toEqual(["recent", "old"]);
  });
});
