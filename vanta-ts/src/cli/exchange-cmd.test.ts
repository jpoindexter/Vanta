import { describe, it, expect } from "vitest";
import {
  formatDeptSkills,
  formatEntry,
  handleExchange,
  type ExchangeDeps,
} from "./exchange-cmd.js";
import type { ExchangeEntry } from "../cofounder/skill-exchange.js";

const NOW = new Date("2026-06-20T12:00:00.000Z");

type Harness = {
  deps: ExchangeDeps;
  lines: string[];
  /** Current persisted exchange entries (writes mutate this). */
  entries: () => ExchangeEntry[];
};

function harness(initial: ExchangeEntry[] = []): Harness {
  const lines: string[] = [];
  const state = { entries: initial };
  const deps: ExchangeDeps = {
    readExchange: async () => state.entries,
    writeExchange: async (entries) => {
      state.entries = entries;
    },
    log: (line) => lines.push(line),
    now: () => NOW,
  };
  return { deps, lines, entries: () => state.entries };
}

describe("handleExchange — publish", () => {
  it("publishes a skill and persists the entry", async () => {
    const h = harness();
    const code = await handleExchange(["publish", "design-tokens", "design"], h.deps);
    expect(code).toBe(0);
    expect(h.entries()).toHaveLength(1);
    expect(h.entries()[0]).toMatchObject({ skillId: "design-tokens", publishedBy: "design", adopters: [] });
    expect(h.lines.join("\n")).toContain("published design-tokens by design");
  });

  it("returns 1 and the error when a different department already published it", async () => {
    const h = harness();
    await handleExchange(["publish", "design-tokens", "design"], h.deps);
    const code = await handleExchange(["publish", "design-tokens", "growth"], h.deps);
    expect(code).toBe(1);
    expect(h.lines.join("\n")).toContain("already published by");
  });

  it("returns 1 with usage when args are missing", async () => {
    const h = harness();
    const code = await handleExchange(["publish", "design-tokens"], h.deps);
    expect(code).toBe(1);
    expect(h.lines.join("\n")).toContain("usage:");
  });
});

describe("handleExchange — adopt", () => {
  it("adopts a published skill for a department", async () => {
    const h = harness();
    await handleExchange(["publish", "design-tokens", "design"], h.deps);
    const code = await handleExchange(["adopt", "design-tokens", "growth"], h.deps);
    expect(code).toBe(0);
    expect(h.entries()[0]?.adopters).toEqual(["growth"]);
    expect(h.lines.join("\n")).toContain("growth adopted design-tokens");
  });

  it("returns 1 when the skill was never published", async () => {
    const h = harness();
    const code = await handleExchange(["adopt", "ghost", "growth"], h.deps);
    expect(code).toBe(1);
    expect(h.lines.join("\n")).toContain("not published");
  });

  it("re-adopting is idempotent and stays green", async () => {
    const h = harness();
    await handleExchange(["publish", "design-tokens", "design"], h.deps);
    await handleExchange(["adopt", "design-tokens", "growth"], h.deps);
    const code = await handleExchange(["adopt", "design-tokens", "growth"], h.deps);
    expect(code).toBe(0);
    expect(h.entries()[0]?.adopters).toEqual(["growth"]);
  });
});

describe("handleExchange — list", () => {
  it("lists every entry", async () => {
    const h = harness();
    await handleExchange(["publish", "zeta", "design"], h.deps);
    await handleExchange(["publish", "alpha", "design"], h.deps);
    h.lines.length = 0;
    const code = await handleExchange(["list"], h.deps);
    expect(code).toBe(0);
    // sorted by skill id
    expect(h.lines[0]).toContain("alpha");
    expect(h.lines[1]).toContain("zeta");
  });

  it("reports an empty exchange", async () => {
    const h = harness();
    const code = await handleExchange(["list"], h.deps);
    expect(code).toBe(0);
    expect(h.lines.join("\n")).toContain("no exchange entries");
  });

  it("scopes a department's loaded skills (only adopters see a published skill)", async () => {
    // done-criterion end-to-end: A publishes, B adopts → only B loads it.
    const h = harness();
    await handleExchange(["publish", "design-tokens", "design"], h.deps);
    await handleExchange(["adopt", "design-tokens", "growth"], h.deps);

    h.lines.length = 0;
    await handleExchange(["list", "growth"], h.deps);
    expect(h.lines.join("\n")).toContain("design-tokens");

    h.lines.length = 0;
    await handleExchange(["list", "ops"], h.deps);
    expect(h.lines.join("\n")).toContain("ops loads: (none)");
    expect(h.lines.join("\n")).not.toContain("design-tokens");
  });
});

describe("handleExchange — dispatch", () => {
  it("prints usage and returns 0 on no subcommand", async () => {
    const h = harness();
    const code = await handleExchange([], h.deps);
    expect(code).toBe(0);
    expect(h.lines.join("\n")).toContain("usage:");
  });

  it("returns 1 on an unknown subcommand", async () => {
    const h = harness();
    const code = await handleExchange(["frobnicate"], h.deps);
    expect(code).toBe(1);
    expect(h.lines.join("\n")).toContain("usage:");
  });
});

describe("formatters", () => {
  it("formats an entry with adopters", () => {
    const entry: ExchangeEntry = {
      skillId: "design-tokens",
      publishedBy: "design",
      adopters: ["growth", "ops"],
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };
    expect(formatEntry(entry)).toBe("design-tokens · published by design · adopters: growth, ops");
  });

  it("formats an entry with no adopters", () => {
    const entry: ExchangeEntry = {
      skillId: "design-tokens",
      publishedBy: "design",
      adopters: [],
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };
    expect(formatEntry(entry)).toContain("adopters: (none)");
  });

  it("formats a department's scoped skills (publisher loads its own publication)", () => {
    const entries: ExchangeEntry[] = [
      {
        skillId: "design-tokens",
        publishedBy: "design",
        adopters: [],
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ];
    expect(formatDeptSkills("design", entries)).toBe("design loads: design-tokens");
    expect(formatDeptSkills("growth", entries)).toBe("growth loads: (none)");
  });
});
