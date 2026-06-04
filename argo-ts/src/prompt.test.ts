import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./prompt.js";
import type { Goal } from "./types.js";

describe("buildSystemPrompt", () => {
  const tools = [
    { name: "read_file", description: "Read a file", parameters: {} },
  ];

  it("includes goals, tools, scope, and verification rules", async () => {
    const goals: Goal[] = [
      { id: 1, text: "Ship Argo v0", status: "active" },
      { id: 2, text: "Old goal", status: "done" },
    ];
    const prompt = await buildSystemPrompt({
      root: "/tmp/argo",
      soulPath: "/nonexistent/SOUL.md",
      goals,
      tools,
      now: "2026-06-02T00:00:00Z",
    });
    expect(prompt).toContain("Ship Argo v0");
    expect(prompt).not.toContain("Old goal");
    expect(prompt).toContain("read_file");
    expect(prompt).toContain("/tmp/argo");
    expect(prompt).toContain("Never declare a task complete without verified");
  });

  it("frames Argo as a personal operator across digital life, not a repo-confined coding tool", async () => {
    const prompt = await buildSystemPrompt({
      root: "/tmp/argo",
      soulPath: "/nonexistent/SOUL.md",
      goals: [],
      tools,
      now: "2026-06-02T00:00:00Z",
    });
    expect(prompt).toContain("personal operator");
    expect(prompt).toMatch(/digital life/i);
    // File work is scoped (safety), but the agent is not described as confined.
    expect(prompt).toContain("File writes stay within /tmp/argo");
    expect(prompt).not.toContain("Never write outside"); // old coding-confinement wording is gone
    expect(prompt).toMatch(/honest about limits/i);
  });

  it("notes when there are no active goals", async () => {
    const prompt = await buildSystemPrompt({
      root: "/tmp/argo",
      soulPath: "/nonexistent/SOUL.md",
      goals: [],
      tools,
      now: "2026-06-02T00:00:00Z",
    });
    expect(prompt).toContain("no active goals");
  });

  it("injects the skill index (names + descriptions) when skills are provided", async () => {
    const prompt = await buildSystemPrompt({
      root: "/tmp/argo",
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
      root: "/tmp/argo",
      soulPath: "/nonexistent/SOUL.md",
      goals: [],
      tools,
      now: "2026-06-02T00:00:00Z",
    });
    expect(prompt).not.toContain("Your learned skills");
  });

  it("injects memory into the volatile tier when provided", async () => {
    const prompt = await buildSystemPrompt({
      root: "/tmp/argo",
      soulPath: "/nonexistent/SOUL.md",
      goals: [{ id: 1, text: "Ship Argo v0", status: "active" }],
      tools,
      now: "2026-06-02T00:00:00Z",
      memory: "Earlier I learned the build runs with `npm test`.",
    });
    expect(prompt).toContain("Recent memory toward your goals:");
    expect(prompt).toContain("Earlier I learned the build runs");
  });

  it("injects the MOIM note at the top of the volatile tier when provided", async () => {
    const prompt = await buildSystemPrompt({
      root: "/tmp/argo",
      soulPath: "/nonexistent/SOUL.md",
      goals: [{ id: 1, text: "Ship Argo v0", status: "active" }],
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
      root: "/tmp/argo",
      soulPath: "/nonexistent/SOUL.md",
      goals: [],
      tools,
      now: "2026-06-02T00:00:00Z",
    });
    expect(prompt).not.toContain("Top of mind");
    expect(prompt).not.toContain("pinned by user");
  });
});
