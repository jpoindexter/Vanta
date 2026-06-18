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

  it("summarizes a large tool catalog instead of listing every tool in the stable prompt", async () => {
    const manyTools = [
      "tool_search", "clarify", "brain", "recall", "inspect_state", "read_file", "grep_files", "glob_files",
      "web_search", "web_fetch", "git_status", "git_diff", "edit_file", "write_file", "lsp_diagnostics",
      "gmail_send", "calendar_create", "browser_act", "money", "radar", "roadmap_move",
    ].map((name) => ({ name, description: `${name} tool`, parameters: {} }));
    const prompt = await buildSystemPrompt({
      root: "/tmp/vanta",
      soulPath: "/nonexistent/SOUL.md",
      goals: [],
      tools: manyTools,
      now: "2026-06-02T00:00:00Z",
    });
    expect(prompt).toContain("Available tools (scoped)");
    expect(prompt).toContain("tool_search");
    expect(prompt).not.toContain("gmail_send");
  });

  it("frames a carried goal as PAUSED when goalsPaused, active otherwise", async () => {
    const goals: Goal[] = [{ id: 1, text: "Ship Vanta v0", status: "active" }];
    const base = { root: "/tmp/vanta", soulPath: "/nonexistent/SOUL.md", goals, tools, now: "2026-06-02T00:00:00Z" };

    const paused = await buildSystemPrompt({ ...base, goalsPaused: true });
    expect(paused).toContain("Ship Vanta v0"); // goal still visible
    expect(paused).toContain("PAUSED");
    expect(paused).toContain("/goal resume");

    const active = await buildSystemPrompt({ ...base, goalsPaused: false });
    expect(active).toContain("Active goals:");
    expect(active).not.toContain("PAUSED");
  });

  it("injects Ralph loop continuity as paused work, not an active directive", async () => {
    const prompt = await buildSystemPrompt({
      root: "/tmp/vanta",
      soulPath: "/nonexistent/SOUL.md",
      goals: [],
      tools,
      now: "2026-06-02T00:00:00Z",
      ralphContinuity: "Ralph loop progress found — PAUSED. Use /goal resume or /goal drop.",
    });
    expect(prompt).toContain("Ralph loop progress found");
    expect(prompt).toContain("PAUSED");
    expect(prompt).toContain("/goal resume");
    expect(prompt).not.toContain("work toward it now");
  });

  it("carries the operator voice rule and the hardened done-claim discipline (BEHAVIOR-VOICE)", async () => {
    const prompt = await buildSystemPrompt({
      root: "/tmp/vanta",
      soulPath: "/nonexistent/SOUL.md",
      goals: [],
      tools,
      now: "2026-06-02T00:00:00Z",
    });
    // Voice: direct/warm, no AI-magic phrasing.
    expect(prompt).toContain("Voice: direct, warm, structured");
    expect(prompt).toContain("do not sand off all human signal");
    expect(prompt).toContain("Use contractions");
    expect(prompt).toContain("Warmth is not glaze");
    expect(prompt).toContain("no hype or AI-magic phrasing");
    // Hardened verify-before-claim: cite the proving evidence, not prose.
    expect(prompt).toContain("cite the command and its result");
    expect(prompt).toContain('claim "done"');
  });

  it("folds in VERIFY-RIGHT, TRUST-LABELS, REF-FIDELITY, BETTER-ENDINGS without adding rules", async () => {
    const prompt = await buildSystemPrompt({
      root: "/tmp/vanta", soulPath: "/nonexistent/SOUL.md", goals: [], tools, now: "2026-06-02T00:00:00Z",
    });
    expect(prompt).toContain("prove the ACTUAL claim");          // VERIFY-RIGHT
    expect(prompt).toContain("verified (tool-backed) / inferred / uncertain"); // TRUST-LABELS
    expect(prompt).toContain("inspect X's real structure");      // REF-FIDELITY
    expect(prompt).toContain("what changed · what was verified · what remains · next"); // BETTER-ENDINGS
    // Folded into rules 1/4/7 — rule 10 (Voice) is still the last operating rule.
    expect(prompt).toContain("10. Voice");
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

  it("injects the approved tunable program block when provided", async () => {
    const prompt = await buildSystemPrompt({
      root: "/tmp/vanta",
      soulPath: "/nonexistent/SOUL.md",
      goals: [],
      tools,
      now: "2026-06-02T00:00:00Z",
      program: "- Prefer verified deltas.",
    });
    expect(prompt).toContain("Tunable program instructions:");
    expect(prompt).toContain("Prefer verified deltas.");
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
