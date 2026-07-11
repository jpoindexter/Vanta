import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promptCommand } from "./prompt-cmd.js";
import type { ReplCtx } from "./types.js";

const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "vanta-prompt-command-"));
  const home = join(root, "home");
  roots.push(root);
  mkdirSync(join(root, ".vanta", "agents"), { recursive: true });
  mkdirSync(join(home, "agents"), { recursive: true });
  writeFileSync(join(root, ".vanta", "agents", "reviewer.md"), "---\nname: reviewer\ndescription: project reviewer\n---\nPROJECT REVIEW PROMPT\n");
  writeFileSync(join(home, "agents", "reviewer.md"), "---\nname: reviewer\n---\nHOME REVIEW PROMPT\n");
  const messages = [{ role: "system", content: "BASE SAFETY PROMPT" }] as ReplCtx["convo"]["messages"];
  const ctx = {
    convo: { messages },
    setup: { root },
    dataDir: join(root, ".vanta"),
    env: { VANTA_HOME: home },
  } as unknown as ReplCtx;
  return { ctx, messages };
}

describe("/prompt", () => {
  it("lists built-in and custom prompts with project precedence", async () => {
    const { ctx } = fixture();
    const result = await promptCommand("list", ctx);
    expect(result.output).toContain("general-purpose");
    expect(result.output).toContain("reviewer");
    const shown = await promptCommand("show reviewer", ctx);
    expect(shown.output).toContain("PROJECT REVIEW PROMPT");
    expect(shown.output).not.toContain("HOME REVIEW PROMPT");
  });

  it("switches, replaces, and resets a live prompt without removing the base", async () => {
    const { ctx, messages } = fixture();
    await promptCommand("use reviewer", ctx);
    expect(messages[0]!.content).toContain("BASE SAFETY PROMPT");
    expect(messages[0]!.content).toContain("PROJECT REVIEW PROMPT");
    await promptCommand("use plan", ctx);
    expect(messages[0]!.content).toContain("BASE SAFETY PROMPT");
    expect(messages[0]!.content).toContain("PLAN — you are a planning worker");
    expect(messages[0]!.content).not.toContain("PROJECT REVIEW PROMPT");
    await promptCommand("reset", ctx);
    expect(messages[0]!.content).toBe("BASE SAFETY PROMPT");
  });

  it("does not silently fall back when a named preset is missing", async () => {
    const { ctx } = fixture();
    expect((await promptCommand("use missing", ctx)).output).toContain("unknown prompt preset");
  });
});
