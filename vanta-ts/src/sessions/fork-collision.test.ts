import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fork } from "../repl/session-cmds.js";
import type { ReplCtx } from "../repl/types.js";
import { forkSessionAt } from "./fork-at.js";
import { forkSession, newSessionId, saveSession } from "./store.js";

vi.mock("node:crypto", async (original) => ({ ...await original<typeof import("node:crypto")>(), randomUUID: () => "collision" }));

let home: string;
let env: NodeJS.ProcessEnv;
const now = new Date("2026-10-28T10:00:00Z");
const messages = [{ role: "user" as const, content: "Preserve parent" }];
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-fork-collision-")); env = { VANTA_HOME: home };
  await saveSession("parent", messages, { env });
  await saveSession(`${newSessionId(now)}-collision`, [{ role: "user", content: "Do not overwrite" }], { env });
});
afterEach(async () => { await rm(home, { recursive: true, force: true }); });

describe("fork identity collision", () => {
  it.each([forkSession, forkSessionAt])("refuses a UUID collision without altering another session", async (copy) => {
    const file = join(home, `sessions/${newSessionId(now)}-collision.json`);
    const before = await readFile(file, "utf8");
    await expect(copy("parent", { env, now })).rejects.toThrow("session changed since snapshot");
    expect(await readFile(file, "utf8")).toBe(before);
  });

  it("does not switch the live CLI session after a create-only collision", async () => {
    const state = { sessionId: "parent", started: "original", turnIndex: 1 };
    const ctx = { env, state, convo: { messages }, now: () => now } as unknown as ReplCtx;
    const file = join(home, `sessions/${newSessionId(now)}-collision.json`);
    const before = await readFile(file, "utf8");
    expect((await fork("", ctx)).output).toContain("Could not save fork");
    expect(state).toEqual({ sessionId: "parent", started: "original", turnIndex: 1 });
    expect(await readFile(file, "utf8")).toBe(before);
  });
});
