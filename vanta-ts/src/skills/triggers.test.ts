import { describe, it, expect } from "vitest";
import {
  compileTriggers,
  compileTriggersForClaude,
  buildTriggerNote,
  mergeVantaHooks,
  mergeClaudeSettings,
  claudeToolMap,
  TRIGGER_MARKER,
} from "./triggers.js";
import type { Skill, SkillTrigger } from "./types.js";

const skill = (triggers: SkillTrigger[], name = "ship-preflight"): Skill => ({
  meta: { name, description: "Run the suite before a push", created: "", updated: "", tags: [], triggers },
  body: "...",
});

describe("compileTriggers", () => {
  it("compiles match→toolNamePattern and a command carrying the marker", () => {
    const [entry] = compileTriggers(skill([{ event: "PreToolUse", match: "git_push" }]), "vanta");
    expect(entry!.event).toBe("PreToolUse");
    expect(entry!.hook.toolNamePattern).toBe("git_push");
    expect(entry!.hook.command).toContain("skills trigger-emit ship-preflight PreToolUse");
    expect(entry!.hook.command).toContain(TRIGGER_MARKER);
    expect(entry!.hook.statusMessage).toContain("ship-preflight");
  });

  it("maps when:'errors>=N' to onError", () => {
    const [entry] = compileTriggers(skill([{ event: "PostToolUse", when: "errors>=3" }]), "vanta");
    expect(entry!.hook.onError).toBe(true);
  });

  it("skips unknown events (forward-compatible), never throws", () => {
    expect(compileTriggers(skill([{ event: "MadeUpEvent" }]), "vanta")).toEqual([]);
  });

  it("returns [] for a skill with no triggers", () => {
    expect(compileTriggers({ ...skill([]), meta: { ...skill([]).meta, triggers: undefined } }, "vanta")).toEqual([]);
  });
});

describe("compileTriggersForClaude", () => {
  it("compiles Stop, UserPromptSubmit, and PreToolUse (mapped to a Claude matcher)", () => {
    const entries = compileTriggersForClaude(
      skill([{ event: "Stop" }, { event: "UserPromptSubmit" }, { event: "PreToolUse", match: "git_push" }]),
      "vanta",
    );
    expect(entries.map((e) => e.event).sort()).toEqual(["PreToolUse", "Stop", "UserPromptSubmit"]);
    const pre = entries.find((e) => e.event === "PreToolUse")!;
    expect(pre.matcher).toBe("Bash"); // git_push → Bash; the emitter input-gates on "git push"
    expect(pre.command).toContain("--claude");
    expect(pre.command).toMatch(/2>\/dev\/null$/);
  });

  it("skips genuinely-unsupported events (PostToolUse stays Vanta-only)", () => {
    expect(compileTriggersForClaude(skill([{ event: "PostToolUse", when: "errors>=3" }]), "vanta")).toEqual([]);
  });
});

describe("claudeToolMap", () => {
  it("maps known Vanta tool names to Claude matchers + input guards", () => {
    expect(claudeToolMap("git_push")).toEqual({ matcher: "Bash", inputContains: "git push" });
    expect(claudeToolMap("write_file")).toEqual({ matcher: "Write|Edit" });
    expect(claudeToolMap("read_file")).toEqual({ matcher: "Read" });
  });
  it("falls back to the raw match for an unknown tool, '' for none", () => {
    expect(claudeToolMap("CustomTool")).toEqual({ matcher: "CustomTool" });
    expect(claudeToolMap(undefined)).toEqual({ matcher: "" });
  });
});

describe("buildTriggerNote", () => {
  it("names the skill + description, never echoes a query", () => {
    const note = buildTriggerNote(skill([]), "Stop");
    expect(note).toContain("ship-preflight");
    expect(note).toContain("Run the suite before a push");
    expect(note).not.toMatch(/query/i);
  });
});

describe("mergeVantaHooks (idempotent + namespaced)", () => {
  const compiled = compileTriggers(skill([{ event: "Stop" }]), "vanta");

  it("keeps hand-written hooks and adds generated ones", () => {
    const existing = { Stop: [{ type: "command", command: "echo handwritten" }] };
    const merged = mergeVantaHooks(existing, compiled);
    expect(merged.Stop).toHaveLength(2);
    expect(merged.Stop!.some((h) => h.command === "echo handwritten")).toBe(true);
  });

  it("is idempotent — re-merging replaces generated entries, no duplicates", () => {
    const once = mergeVantaHooks({ Stop: [{ type: "command", command: "echo hand" }] }, compiled);
    const twice = mergeVantaHooks(once, compiled);
    expect(twice.Stop).toHaveLength(2); // hand + one generated, not three
  });

  it("removing a trigger + re-merge drops only the generated entry", () => {
    const withGen = mergeVantaHooks({ Stop: [{ type: "command", command: "echo hand" }] }, compiled);
    const cleared = mergeVantaHooks(withGen, []); // no compiled triggers now
    expect(cleared.Stop).toEqual([{ type: "command", command: "echo hand" }]);
  });
});

describe("mergeClaudeSettings", () => {
  const compiled = compileTriggersForClaude(skill([{ event: "Stop" }]), "vanta");

  it("preserves the user's existing Claude hooks and adds generated", () => {
    const settings = { hooks: { Stop: [{ matcher: "", hooks: [{ type: "command", command: "node my-hook.js" }] }] } };
    const merged = mergeClaudeSettings(settings, compiled) as { hooks: Record<string, unknown[]> };
    expect(merged.hooks.Stop).toHaveLength(2);
  });

  it("is idempotent", () => {
    const once = mergeClaudeSettings({ hooks: {} }, compiled) as { hooks: Record<string, unknown[]> };
    const twice = mergeClaudeSettings(once, compiled) as { hooks: Record<string, unknown[]> };
    expect(twice.hooks.Stop).toHaveLength(1);
  });
});
