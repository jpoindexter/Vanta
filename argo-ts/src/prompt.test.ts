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
});
