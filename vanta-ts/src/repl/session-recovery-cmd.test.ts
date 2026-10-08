import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fork, resume, title } from "./session-cmds.js";
import type { ReplCtx } from "./types.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(): Promise<ReplCtx> {
  const root = await mkdtemp(join(tmpdir(), "vanta-session-command-recovery-"));
  roots.push(root);
  return {
    env: { VANTA_HOME: root }, dataDir: join(root, ".vanta"),
    state: { sessionId: "current", title: "Original", started: "2026-10-08T00:00:00Z", turnIndex: 1 },
    convo: { messages: [{ role: "user", content: "Keep my draft context" }] },
    now: () => new Date("2026-10-08T01:00:00Z"),
  } as unknown as ReplCtx;
}

describe("session command recovery", () => {
  it("reports corrupt resume without switching or terminating the current conversation", async () => {
    const ctx = await fixture();
    await mkdir(join(ctx.env.VANTA_HOME!, "sessions"));
    const path = join(ctx.env.VANTA_HOME!, "sessions", "broken.json");
    await writeFile(path, "{broken");
    const before = JSON.stringify({ state: ctx.state, messages: ctx.convo.messages });
    const result = await resume("broken", ctx);
    expect(result.output).toContain("last-known-good");
    expect(result.resumed).toBeUndefined();
    expect(JSON.stringify({ state: ctx.state, messages: ctx.convo.messages })).toBe(before);
    expect(await readFile(path, "utf8")).toBe("{broken");
  });

  it.each([title, fork])("does not claim persistence success or change live state when saving fails", async (handler) => {
    const ctx = await fixture();
    const notDirectory = join(ctx.env.VANTA_HOME!, "not-a-directory");
    await writeFile(notDirectory, "keep");
    ctx.env.VANTA_HOME = notDirectory;
    const before = JSON.stringify(ctx.state);
    const result = await handler("Changed title", ctx);
    expect(result.output).toContain("Could not save");
    expect(JSON.stringify(ctx.state)).toBe(before);
  });
});
