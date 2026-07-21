import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  applyOutputDensity,
  assembleTiers,
  buildSystemPrompt,
  PROMPT_TIERS,
  splitStableVolatile,
  TIER_SEP,
  trimSkillDesc,
  type PromptTier,
  type PromptTierContext,
} from "./prompt.js";
import type { Goal } from "./types.js";

const LENGTH_RULE = "10a. Length: this is a terminal TUI — default to 1–4 short sentences. Lead with the answer.";

describe("applyOutputDensity", () => {
  it("balanced (DEFAULT) returns the length rule unchanged byte-for-byte", () => {
    expect(applyOutputDensity(LENGTH_RULE, "balanced")).toBe(LENGTH_RULE);
  });

  it("minimal tightens the length cap phrase", () => {
    const out = applyOutputDensity(LENGTH_RULE, "minimal");
    expect(out).toContain("1–2 short sentences");
    expect(out).not.toContain("1–4 short sentences");
    expect(out).toContain("Lead with the answer."); // rest of the rule preserved
  });

  it("rich loosens the length cap phrase", () => {
    const out = applyOutputDensity(LENGTH_RULE, "rich");
    expect(out).toContain("as many short sentences as the task genuinely needs");
    expect(out).not.toContain("1–4 short sentences");
  });
});

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

  it("defaults to the balanced length cap (no outputDensity) and scales it when minimal", async () => {
    const base = { root: "/tmp/vanta", soulPath: "/nonexistent/SOUL.md", goals: [], tools, now: "2026-06-02T00:00:00Z" };

    const def = await buildSystemPrompt(base);
    expect(def).toContain("default to 1–4 short sentences"); // DEFAULT unchanged

    const minimal = await buildSystemPrompt({ ...base, outputDensity: "minimal" });
    expect(minimal).toContain("1–2 short sentences");
    expect(minimal).not.toContain("default to 1–4 short sentences");
  });

  it("assembles the profile-driven executive-function contract independently of a custom soul", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-ef-contract-"));
    const soulPath = join(root, "SOUL.md");
    await writeFile(soulPath, "# Custom operator\nHandle invoices without ceremony.\n", "utf8");

    try {
      const prompt = await buildSystemPrompt({
        root,
        soulPath,
        goals: [],
        tools,
        now: "2026-07-14T00:00:00Z",
        ndPreferences: {
          outputDensity: "minimal",
          sensoryLoad: "low",
          timeSupport: "ranges",
          capacity: "low",
          memoryLoad: "high",
          activation: "stuck",
          motivation: "low",
        },
      });

      expect(prompt).toContain("Handle invoices without ceremony.");
      expect(prompt).toContain("Executive-function operating contract");
      expect(prompt).toContain("Now / Next / Later");
      expect(prompt).toContain("at most three ranked choices");
      expect(prompt).toContain("output=minimal");
      expect(prompt).toContain("sensory=low");
      expect(prompt).toContain("time=ranges");
      expect(prompt).toContain("best / realistic / worst");
      expect(prompt).toContain("Capacity is low");
      expect(prompt).toContain("Memory load is high");
      expect(prompt).toContain("Activation support is on");
      expect(prompt).toContain("never invent urgency");
      expect(prompt).toContain("Do not turn a simple request into a coaching ritual");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("builds automatic core support in Auto mode without requiring a skill invocation", async () => {
    const prompt = await buildSystemPrompt({
      root: "/tmp/vanta",
      soulPath: "/nonexistent/SOUL.md",
      goals: [],
      tools,
      now: "2026-07-21T00:00:00Z",
      ndPreferences: {
        outputDensity: "balanced",
        sensoryLoad: "medium",
        timeSupport: "ranges",
        capacity: "auto",
        memoryLoad: "auto",
        activation: "auto",
        motivation: "auto",
      },
    });

    expect(prompt).toContain("built-in automatic support");
    expect(prompt).toContain("core Vanta behavior, not a skill");
    expect(prompt).toContain("stuck, overwhelmed, low on energy, cannot start");
    expect(prompt).toContain("Outcome / Now / Next / Blocker / Done");
    expect(prompt).toContain("Automatic adaptations are turn-local");
    expect(prompt).toContain("never infer diagnosis, identity, personality");
  });

  it("omits the user support contract when the profile is intentionally unavailable", async () => {
    const prompt = await buildSystemPrompt({
      root: "/tmp/vanta",
      soulPath: "/nonexistent/SOUL.md",
      goals: [],
      tools,
      now: "2026-07-14T00:00:00Z",
    });

    expect(prompt).not.toContain("Executive-function operating contract");
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

  it("folds the cyber-risk security-task safety section into the built stable prompt", async () => {
    const prompt = await buildSystemPrompt({
      root: "/tmp/vanta",
      soulPath: "/nonexistent/SOUL.md",
      goals: [],
      tools,
      now: "2026-06-02T00:00:00Z",
    });
    // Present, and in the stable (cacheable) prefix — not the volatile suffix.
    const { stable } = splitStableVolatile(prompt);
    expect(stable).toContain("defensive security");
    expect(stable).toContain("authorized pentest");
    expect(stable).toMatch(/refuse/i);
    expect(stable).toContain("Dual-use tools need a clear authorization context");
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
    // File work defaults to the root, while a named outside target uses approval.
    expect(prompt).toContain("File writes default to /tmp/vanta");
    expect(prompt).toContain("use the exact absolute path");
    expect(prompt).toContain("scoped approval");
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

  it("injects the git instructions block only when provided", async () => {
    const base = {
      root: "/tmp/vanta",
      soulPath: "/nonexistent/SOUL.md",
      goals: [],
      tools,
      now: "2026-06-02T00:00:00Z",
    };
    const without = await buildSystemPrompt(base);
    expect(without).not.toContain("Git best practice:");
    const withBlock = await buildSystemPrompt({ ...base, gitInstructions: "Git best practice:\n- branch first" });
    expect(withBlock).toContain("Git best practice:");
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

describe("buildSystemPrompt — MSG-PLATFORM-HINTS", () => {
  const sampleTools = [{ name: "read_file", description: "Read a file", parameters: {} }];
  const base = {
    root: "/tmp/vanta",
    soulPath: "/nonexistent/SOUL.md",
    goals: [] as Goal[],
    tools: sampleTools,
    now: "2026-06-02T00:00:00Z",
  };

  // The env the gateway sets can leak in from the runner — isolate it per test.
  const ORIGINAL_ENV = process.env.VANTA_GATEWAY_PLATFORM;
  beforeEach(() => {
    delete process.env.VANTA_GATEWAY_PLATFORM;
  });
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.VANTA_GATEWAY_PLATFORM;
    else process.env.VANTA_GATEWAY_PLATFORM = ORIGINAL_ENV;
  });

  it("default (no platform, no env) leaves the prompt unchanged byte-for-byte", async () => {
    const plain = await buildSystemPrompt(base);
    const withUndefined = await buildSystemPrompt({ ...base, gatewayPlatform: undefined });
    expect(withUndefined).toBe(plain);
    expect(plain).not.toContain("You're on");
  });

  it("folds the IRC hint (no markdown) into the prompt when gatewayPlatform is irc", async () => {
    const prompt = await buildSystemPrompt({ ...base, gatewayPlatform: "irc" });
    expect(prompt).toContain("You're on IRC");
    expect(prompt.toLowerCase()).toContain("no markdown");
  });

  it("emits less markdown guidance for IRC than the markdown-capable Telegram hint", async () => {
    const irc = await buildSystemPrompt({ ...base, gatewayPlatform: "irc" });
    const telegram = await buildSystemPrompt({ ...base, gatewayPlatform: "telegram" });
    // IRC tells the agent NOT to use markdown; Telegram tells it markdown is supported.
    expect(irc.toLowerCase()).toContain("no markdown");
    expect(telegram).toContain("MarkdownV2");
    expect(irc).not.toContain("MarkdownV2");
  });

  it("adds no hint line for an unknown platform id (default prompt preserved)", async () => {
    const plain = await buildSystemPrompt(base);
    const unknown = await buildSystemPrompt({ ...base, gatewayPlatform: "nosuchplatform" });
    expect(unknown).toBe(plain);
  });

  it("sources the hint from VANTA_GATEWAY_PLATFORM when no field is passed", async () => {
    process.env.VANTA_GATEWAY_PLATFORM = "irc";
    const prompt = await buildSystemPrompt(base);
    expect(prompt).toContain("You're on IRC");
  });
});

// PORT-PROMPT-TIERS: the tier registry is a port — order, replacement, and additions
// are data (the tier LIST), assembled by ONE logic path (assembleTiers). These tests
// lock that contract: an alternate list runs through the same assembler with no core edit.
describe("PROMPT_TIERS registry (PORT-PROMPT-TIERS)", () => {
  const tier = (id: string, out: string): PromptTier => ({ id, render: () => out });
  // assembleTiers only reads what the tiers themselves read; custom tiers here ignore ctx.
  const ctx = {} as PromptTierContext;

  it("renders tiers in list order and joins them with TIER_SEP", async () => {
    const out = await assembleTiers([tier("a", "AAA"), tier("b", "BBB"), tier("c", "CCC")], ctx);
    expect(out).toBe(["AAA", "BBB", "CCC"].join(TIER_SEP));
  });

  it("reordering the list reorders the output — no assembler edit", async () => {
    const tiers = [tier("a", "AAA"), tier("b", "BBB"), tier("c", "CCC")];
    const reversed = await assembleTiers([...tiers].reverse(), ctx);
    expect(reversed).toBe(["CCC", "BBB", "AAA"].join(TIER_SEP));
  });

  it("drops empty-rendering tiers (no stray separators)", async () => {
    const out = await assembleTiers([tier("a", "AAA"), tier("gap", ""), tier("c", "CCC")], ctx);
    expect(out).toBe(["AAA", "CCC"].join(TIER_SEP));
    expect(out).not.toContain(`${TIER_SEP}${TIER_SEP}`);
  });

  it("supports adding a new tier and awaits async renders", async () => {
    const asyncTier: PromptTier = { id: "async", render: async () => "LATE" };
    const out = await assembleTiers([tier("a", "AAA"), asyncTier], ctx);
    expect(out).toBe(["AAA", "LATE"].join(TIER_SEP));
  });

  it("the real registry starts with the cache-stable tier and ends with volatile", () => {
    const ids = PROMPT_TIERS.map((t) => t.id);
    expect(ids[0]).toBe("stable");
    expect(ids[ids.length - 1]).toBe("volatile");
    expect(new Set(ids).size).toBe(ids.length); // ids are unique
  });
});
