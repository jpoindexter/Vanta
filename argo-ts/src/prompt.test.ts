import { describe, it, expect } from "vitest";
import { buildSystemPrompt, splitStableVolatile, TIER_SEP, trimSkillDesc } from "./prompt.js";
import type { Goal } from "./types.js";

describe("trimSkillDesc", () => {
  it("leaves a short single-line description unchanged", () => {
    expect(trimSkillDesc("Quick web search.")).toBe("Quick web search.");
  });

  it("keeps only the first line of a multi-line description", () => {
    expect(trimSkillDesc("First line.\nSecond line.\nThird.")).toBe("First line.");
  });

  it("clips a long description to 100 chars including the ellipsis", () => {
    const long = "x".repeat(200);
    const out = trimSkillDesc(long);
    expect(out.length).toBe(100);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("buildSystemPrompt", () => {
  const tools = [
    { name: "read_file", description: "Read a file", parameters: {} },
  ];

  it("includes goals, tools, scope, and verification rules", async () => {
    const goals: Goal[] = [
      { id: 1, text: "Ship Vanta v0", status: "active" },
      { id: 2, text: "Old goal", status: "done" },
    ];
    const prompt = await buildSystemPrompt({
      root: "/tmp/vanta",
      soulPath: "/nonexistent/SOUL.md",
      goals,
      tools,
      now: "2026-06-02T00:00:00Z",
    });
    expect(prompt).toContain("Ship Vanta v0");
    expect(prompt).not.toContain("Old goal");
    expect(prompt).toContain("read_file");
    expect(prompt).toContain("/tmp/vanta");
    expect(prompt).toContain("Never declare a task complete without verified");
  });

  it("frames Vanta as a personal operator across digital life, not a repo-confined coding tool", async () => {
    const prompt = await buildSystemPrompt({
      root: "/tmp/vanta",
      soulPath: "/nonexistent/SOUL.md",
      goals: [],
      tools,
      now: "2026-06-02T00:00:00Z",
    });
    expect(prompt).toContain("personal operator");
    expect(prompt).toMatch(/digital life/i);
    // File work is scoped (safety), but the agent is not described as confined.
    expect(prompt).toContain("File writes stay within /tmp/vanta");
    expect(prompt).not.toContain("Never write outside"); // old coding-confinement wording is gone
    expect(prompt).toMatch(/honest about limits/i);
  });

  it("notes when there are no active goals", async () => {
    const prompt = await buildSystemPrompt({
      root: "/tmp/vanta",
      soulPath: "/nonexistent/SOUL.md",
      goals: [],
      tools,
      now: "2026-06-02T00:00:00Z",
    });
    expect(prompt).toContain("no active goals");
  });

  it("injects the skill index (names + descriptions) when skills are provided", async () => {
    const prompt = await buildSystemPrompt({
      root: "/tmp/vanta",
      soulPath: "/nonexistent/SOUL.md",
      goals: [],
      tools,
      now: "2026-06-02T00:00:00Z",
      skills: [
        { name: "systematic-debugging", description: "trace root cause before fixing" },
        { name: "tdd-cycle", description: "red-green-refactor loop" },
      ],
    });
    expect(prompt).toContain("Your learned skills");
    expect(prompt).toContain("systematic-debugging: trace root cause before fixing");
    expect(prompt).toContain("tdd-cycle: red-green-refactor loop");
    expect(prompt).toContain("recall"); // tells the agent how to load a body
  });

  it("omits the skills section when there are none", async () => {
    const prompt = await buildSystemPrompt({
      root: "/tmp/vanta",
      soulPath: "/nonexistent/SOUL.md",
      goals: [],
      tools,
      now: "2026-06-02T00:00:00Z",
    });
    expect(prompt).not.toContain("Your learned skills");
  });

  it("injects memory into the volatile tier when provided", async () => {
    const prompt = await buildSystemPrompt({
      root: "/tmp/vanta",
      soulPath: "/nonexistent/SOUL.md",
      goals: [{ id: 1, text: "Ship Vanta v0", status: "active" }],
      tools,
      now: "2026-06-02T00:00:00Z",
      memory: "Earlier I learned the build runs with `npm test`.",
    });
    expect(prompt).toContain("Recent memory toward your goals:");
    expect(prompt).toContain("Earlier I learned the build runs");
  });

  it("injects the MOIM note at the top of the volatile tier when provided", async () => {
    const prompt = await buildSystemPrompt({
      root: "/tmp/vanta",
      soulPath: "/nonexistent/SOUL.md",
      goals: [{ id: 1, text: "Ship Vanta v0", status: "active" }],
      tools,
      now: "2026-06-02T00:00:00Z",
      moimNote: "debugging the auth flow",
    });
    expect(prompt).toContain("Top of mind");
    expect(prompt).toContain("debugging the auth flow");
    // MOIM appears before goals in the volatile tier
    expect(prompt.indexOf("debugging the auth flow")).toBeLessThan(prompt.indexOf("Active goals:"));
  });

  it("omits the MOIM block when no note is set", async () => {
    const prompt = await buildSystemPrompt({
      root: "/tmp/vanta",
      soulPath: "/nonexistent/SOUL.md",
      goals: [],
      tools,
      now: "2026-06-02T00:00:00Z",
    });
    expect(prompt).not.toContain("Top of mind");
    expect(prompt).not.toContain("pinned by user");
  });
});

describe("splitStableVolatile", () => {
  it("splits on the last TIER_SEP — stable is everything before, volatile is everything after", () => {
    const { stable, volatile } = splitStableVolatile(`stable part${TIER_SEP}volatile part`);
    expect(stable).toBe("stable part");
    expect(volatile).toBe("volatile part");
  });

  it("returns the full string as stable with empty volatile when no separator is present", () => {
    const { stable, volatile } = splitStableVolatile("no separator here");
    expect(stable).toBe("no separator here");
    expect(volatile).toBe("");
  });

  it("splits on the LAST separator — all middle tiers stay in stable", () => {
    const input = `tier1${TIER_SEP}tier2${TIER_SEP}tier3`;
    const { stable, volatile } = splitStableVolatile(input);
    expect(stable).toBe(`tier1${TIER_SEP}tier2`);
    expect(volatile).toBe("tier3");
  });

  it("buildSystemPrompt volatile tier (after split) contains goals and session time, not stable rules", async () => {
    const sampleTools = [{ name: "read_file", description: "Read a file", parameters: {} }];
    const prompt = await buildSystemPrompt({
      root: "/tmp/vanta",
      soulPath: "/nonexistent/SOUL.md",
      goals: [{ id: 1, text: "Ship v1", status: "active" }],
      tools: sampleTools,
      now: "2026-06-02T00:00:00Z",
    });
    const { stable, volatile } = splitStableVolatile(prompt);
    expect(volatile).toContain("Active goals:");
    expect(volatile).toContain("Session started:");
    expect(stable).toContain("read_file"); // tools are in the stable part
    expect(stable).not.toContain("Session started:");
  });

  it("injects errorsLog when provided", async () => {
    const sampleTools = [{ name: "read_file", description: "Read a file", parameters: {} }];
    const prompt = await buildSystemPrompt({
      root: "/tmp/vanta",
      soulPath: "/nonexistent/SOUL.md",
      goals: [],
      tools: sampleTools,
      now: "2026-06-02T00:00:00Z",
      errorsLog: "## 2026-01-01 — broken migration\nWhat failed: direct SQL\n",
    });
    expect(prompt).toContain("ERRORS.md");
    expect(prompt).toContain("broken migration");
  });

  it("omits errors tier when errorsLog is absent", async () => {
    const sampleTools = [{ name: "read_file", description: "Read a file", parameters: {} }];
    const prompt = await buildSystemPrompt({
      root: "/tmp/vanta",
      soulPath: "/nonexistent/SOUL.md",
      goals: [],
      tools: sampleTools,
      now: "2026-06-02T00:00:00Z",
    });
    expect(prompt).not.toContain("ERRORS.md");
  });
});
