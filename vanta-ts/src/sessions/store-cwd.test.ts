import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { forkSessionAt } from "./fork-at.js";
import { forkSession, listAllSessions, loadSession, saveSession, setSessionArchived } from "./store.js";

let env: NodeJS.ProcessEnv;
let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-session-cwd-"));
  env = { VANTA_HOME: home };
});
afterEach(async () => { await rm(home, { recursive: true, force: true }); });

const MESSAGES = [{ role: "user" as const, content: "hello" }, { role: "assistant" as const, content: "hi" }];

describe("session working folder", () => {
  it("is recorded on save and listed with the session", async () => {
    await saveSession("a", MESSAGES, { env, cwd: "/work/acme" });
    expect((await listAllSessions(env)).find((meta) => meta.id === "a")?.cwd).toBe("/work/acme");
  });

  it("keeps the first folder when a later save names another, and when a rename or archive rewrites the file", async () => {
    await saveSession("a", MESSAGES, { env, cwd: "/work/acme" });
    await saveSession("a", MESSAGES, { env, cwd: "/work/other" });
    await setSessionArchived("a", true, env);
    expect((await loadSession("a", env))?.cwd).toBe("/work/acme");
  });

  it("is adopted by a session saved before folders were kept, once, on its next save", async () => {
    await saveSession("old", MESSAGES, { env });
    expect((await loadSession("old", env))?.cwd).toBeUndefined();
    await saveSession("old", MESSAGES, { env, cwd: "/work/acme" });
    expect((await loadSession("old", env))?.cwd).toBe("/work/acme");
  });

  it("carries over to a fork and to a branch", async () => {
    await saveSession("a", MESSAGES, { env, cwd: "/work/acme" });
    const fork = await forkSession("a", { env });
    const branch = await forkSessionAt("a", { env });
    expect(fork?.cwd).toBe("/work/acme");
    expect(branch?.cwd).toBe("/work/acme");
  });

  it("leaves a session with no folder without one", async () => {
    await saveSession("none", MESSAGES, { env });
    const meta = (await listAllSessions(env)).find((entry) => entry.id === "none");
    expect(meta && "cwd" in meta && meta.cwd !== undefined).toBe(false);
  });
});
