import { describe, it, expect } from "vitest";
import {
  distillSkillDraft,
  buildSkillifyContent,
  skillify,
  NOTHING_TO_SKILLIFY,
} from "./skillify-cmd.js";
import { parseSkill } from "../skills/frontmatter.js";
import type { Message } from "../types.js";
import type { ReplCtx } from "./types.js";

const FIXED = new Date("2026-06-21T10:00:00.000Z");

describe("distillSkillDraft", () => {
  it("slugifies the explicit name arg when given", () => {
    const draft = distillSkillDraft({
      name: "Deploy The Site!",
      firstUserGoal: "ship the build",
      toolSequence: ["shell_cmd"],
    });
    expect(draft.name).toBe("deploy-the-site");
  });

  it("falls back to a slug of the goal when no name arg", () => {
    const draft = distillSkillDraft({
      firstUserGoal: "Run the test suite",
      toolSequence: ["shell_cmd"],
    });
    expect(draft.name).toBe("run-the-test-suite");
  });

  it("uses unnamed-skill when neither name nor goal is present", () => {
    const draft = distillSkillDraft({ toolSequence: [] });
    expect(draft.name).toBe("unnamed-skill");
  });

  it("sets the description to a one-line of the goal", () => {
    const draft = distillSkillDraft({
      firstUserGoal: "Find and fix the failing login test",
      toolSequence: ["read_file"],
    });
    expect(draft.description).toBe("Find and fix the failing login test");
  });

  it("provides a default description when the goal is empty", () => {
    const draft = distillSkillDraft({ toolSequence: ["read_file"] });
    expect(draft.description).toMatch(/reusable workflow/i);
  });

  it("body lists the goal and the ordered distinct tool steps", () => {
    const draft = distillSkillDraft({
      firstUserGoal: "Patch the bug",
      toolSequence: ["read_file", "write_file", "shell_cmd"],
    });
    expect(draft.body).toContain("## Goal");
    expect(draft.body).toContain("Patch the bug");
    expect(draft.body).toContain("## Procedure");
    expect(draft.body).toContain("1. read_file");
    expect(draft.body).toContain("2. write_file");
    expect(draft.body).toContain("3. shell_cmd");
  });

  it("dedupes CONSECUTIVE tool steps but keeps non-adjacent repeats", () => {
    const draft = distillSkillDraft({
      firstUserGoal: "Edit loop",
      toolSequence: ["read_file", "read_file", "write_file", "read_file"],
    });
    // read_file (collapsed) → write_file → read_file (non-adjacent, kept)
    expect(draft.body).toContain("1. read_file");
    expect(draft.body).toContain("2. write_file");
    expect(draft.body).toContain("3. read_file");
    expect(draft.body).not.toContain("4.");
  });

  it("folds keyActions into the procedure after the tool sequence", () => {
    const draft = distillSkillDraft({
      firstUserGoal: "Release",
      toolSequence: ["git"],
      keyActions: ["open a PR"],
    });
    expect(draft.body).toContain("1. git");
    expect(draft.body).toContain("2. open a PR");
  });

  it("control-strips the goal and the action steps", () => {
    const draft = distillSkillDraft({
      // Embedded control chars (ESC, BEL, NUL) must not survive into the draft.
      firstUserGoal: "ship\u001b the build\u0007",
      toolSequence: ["shell\u0000_cmd"],
    });
    expect(draft.description).toBe("ship the build");
    expect(draft.body).not.toContain("\u001b");
    expect(draft.body).not.toContain("\u0007");
    expect(draft.body).not.toContain("\u0000");
    // The NUL between shell and _cmd collapses to a single space, not removal.
    expect(draft.body).toContain("shell _cmd");
  });

  it("empty session yields a minimal draft with the nothing-to-skillify note in the body", () => {
    const draft = distillSkillDraft({ toolSequence: [] });
    expect(draft.name).toBe("unnamed-skill");
    expect(draft.body).toContain(NOTHING_TO_SKILLIFY);
    expect(draft.body).toContain("(no goal recorded)");
  });
});

describe("buildSkillifyContent", () => {
  it("produces valid frontmatter + body that round-trips through parseSkill", () => {
    const draft = distillSkillDraft({
      name: "my-skill",
      firstUserGoal: "Do the thing",
      toolSequence: ["read_file", "write_file"],
    });
    const content = buildSkillifyContent(draft, FIXED);
    const parsed = parseSkill(content);
    expect(parsed.meta.name).toBe("my-skill");
    expect(parsed.meta.description).toBe("Do the thing");
    expect(parsed.meta.created).toBe(FIXED.toISOString());
    expect(parsed.meta.updated).toBe(FIXED.toISOString());
    expect(parsed.meta.tags).toContain("vanta-skillify");
    expect(parsed.body).toContain("1. read_file");
    expect(parsed.body).toContain("2. write_file");
  });

  it("starts with a frontmatter fence", () => {
    const content = buildSkillifyContent(distillSkillDraft({ toolSequence: [] }), FIXED);
    expect(content.startsWith("---\n")).toBe(true);
  });
});

function makeCtx(messages: Message[], arg = ""): { ctx: ReplCtx; arg: string } {
  const ctx = {
    convo: { messages },
    now: () => FIXED,
  } as unknown as ReplCtx;
  return { ctx, arg };
}

describe("skillify handler", () => {
  const session: Message[] = [
    { role: "system", content: "you are vanta" },
    { role: "user", content: "Refactor the auth module" },
    {
      role: "assistant",
      content: "",
      toolCalls: [{ id: "1", name: "read_file", arguments: {} }],
    },
    { role: "tool", name: "read_file", content: "ok", toolCallId: "1" },
    {
      role: "assistant",
      content: "",
      toolCalls: [{ id: "2", name: "write_file", arguments: {} }],
    },
  ];

  it("returns a draft preview built from the goal + tool sequence", async () => {
    const { ctx } = makeCtx(session);
    const res = await skillify("", ctx);
    expect(res.output).toContain("Refactor the auth module");
    expect(res.output).toContain("1. read_file");
    expect(res.output).toContain("2. write_file");
    expect(res.output).toContain("name: refactor-the-auth-module");
  });

  it("notes the write is via write_skill and NOT automatic", async () => {
    const { ctx } = makeCtx(session);
    const res = await skillify("", ctx);
    expect(res.output).toContain("write_skill");
    expect(res.output).toMatch(/not written automatically/i);
    // The handler never writes — no exit/restart/resend side effects.
    expect(res.exit).toBeUndefined();
    expect(res.resend).toBeUndefined();
  });

  it("prefers an explicit name arg (slugified) over the goal slug", async () => {
    const { ctx } = makeCtx(session);
    const res = await skillify("Auth Cleanup", ctx);
    expect(res.output).toContain("name: auth-cleanup");
  });

  it("surfaces the nothing-to-skillify note for an empty session", async () => {
    const { ctx } = makeCtx([{ role: "system", content: "you are vanta" }]);
    const res = await skillify("", ctx);
    expect(res.output).toContain(NOTHING_TO_SKILLIFY);
    expect(res.output).toContain("name: unnamed-skill");
  });
});
