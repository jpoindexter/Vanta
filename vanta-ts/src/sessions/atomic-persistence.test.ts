import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicReplaceSessionFile, withSessionLock } from "./atomic-persistence.js";
import { checkpointSessionMessages, listAllSessions, loadSession, readSessionRecovery, recoverSession, renameSession, saveSession, sessionVersion, setSessionArchived, SessionStoreUnreadableError } from "./store.js";
import type { Message } from "../types.js";

const run = promisify(execFile);
const messages: Message[] = [{ role: "user", content: "Keep the original conversation" }];

describe("default session failure-atomic persistence", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;
  const path = (id = "stable") => join(home, "sessions", `${id}.json`);
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-session-atomic-"));
    env = { VANTA_HOME: home };
  });
  afterEach(async () => { await rm(home, { recursive: true, force: true }); });

  it("distinguishes absence from corruption and lists other sessions with a diagnostic", async () => {
    expect(await loadSession("missing", env)).toBeNull();
    await saveSession("stable", messages, { env });
    await saveSession("good", messages, { env });
    await writeFile(path(), "{truncated", "utf8");
    const before = await readdir(join(home, "sessions"));
    await expect(loadSession("stable", env)).rejects.toBeInstanceOf(SessionStoreUnreadableError);
    expect(await listAllSessions(env)).toMatchObject([
      { id: "good", title: "Keep the original conversation" },
      { id: "stable", title: "Session needs recovery: stable", diagnostic: { code: "session_store_unreadable", path: path() } },
    ]);
    expect(await readFile(path(), "utf8")).toBe("{truncated");
    expect(await readdir(join(home, "sessions"))).toEqual(before);
  });

  it("rejects schema failures and mismatched persisted identity without erasing bytes", async () => {
    await saveSession("stable", messages, { env });
    const raw = JSON.parse(await readFile(path(), "utf8")) as Record<string, unknown>;
    for (const invalid of [{ ...raw, id: "someone-else" }, { ...raw, messages: "invalid" }]) {
      const bytes = JSON.stringify(invalid);
      await writeFile(path(), bytes);
      await expect(saveSession("stable", messages, { env })).rejects.toBeInstanceOf(SessionStoreUnreadableError);
      expect(await readFile(path(), "utf8")).toBe(bytes);
    }
  });

  it("retains last-good content and restores only after explicit recovery", async () => {
    await saveSession("stable", messages, { env, now: "2026-10-08T10:00:00.000Z", providerId: "codex", modelId: "gpt-6.1-sol" });
    await renameSession("stable", "A newer title", env);
    await writeFile(path(), "broken-session");
    expect(await readSessionRecovery("stable", env)).toMatchObject({ id: "stable", messages, providerId: "codex", modelId: "gpt-6.1-sol" });
    expect(await readFile(path(), "utf8")).toBe("broken-session");
    const recovered = await recoverSession("stable", env);
    expect(recovered).toMatchObject({ id: "stable", messages, started: "2026-10-08T10:00:00.000Z" });
    expect(await loadSession("stable", env)).toEqual(recovered);
    const suspect = (await readdir(join(home, "sessions"))).find((file) => file.startsWith("stable.json.suspect-"));
    expect(suspect).toBeDefined();
    expect(await readFile(join(home, "sessions", suspect!), "utf8")).toBe("broken-session");
  });

  it("serializes metadata changes and message checkpoints without losing either", async () => {
    await saveSession("stable", messages, { env, title: "Original", providerId: "codex", modelId: "gpt-6.1-sol" });
    const next: Message[] = [...messages, { role: "assistant", content: "The answer" }];
    await Promise.all([renameSession("stable", "Retained title", env), setSessionArchived("stable", true, env), checkpointSessionMessages("stable", next, env)]);
    expect(await loadSession("stable", env)).toMatchObject({ title: "Retained title", archived: true, messages: next, providerId: "codex", modelId: "gpt-6.1-sol" });
  });

  it("retains valid bytes when an interrupted temporary write never reaches rename", async () => {
    await saveSession("stable", messages, { env });
    const original = await readFile(path(), "utf8");
    await expect(atomicReplaceSessionFile(path(), "replacement", async () => { throw new Error("interrupted before rename"); })).rejects.toThrow("interrupted");
    expect(await readFile(path(), "utf8")).toBe(original);
    expect((await readdir(join(home, "sessions"))).filter((file) => file.endsWith(".tmp"))).toEqual([]);
  });

  it("preserves source after a real process exits between flush and rename", async () => {
    await saveSession("stable", messages, { env });
    const original = await readFile(path(), "utf8");
    const script = 'import {atomicReplaceSessionFile,withSessionLock} from "./src/sessions/atomic-persistence.ts"; await withSessionLock(process.argv[1],()=>atomicReplaceSessionFile(process.argv[1], "partial replacement", async () => {process.exit(23)}));';
    await expect(run(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script, path()])).rejects.toMatchObject({ code: 23 });
    expect(await readFile(path(), "utf8")).toBe(original);
    expect(await loadSession("stable", env)).toMatchObject({ id: "stable", messages });
    expect((await readdir(join(home, "sessions"))).some((file) => file.endsWith(".tmp"))).toBe(true);
    await renameSession("stable", "Recovered after crash", env);
    expect(await loadSession("stable", env)).toMatchObject({ title: "Recovered after crash", messages });
    expect((await readdir(join(home, "sessions"))).includes("stable.json.lock")).toBe(false);
  });

  it("serializes real cross-process metadata writers", async () => {
    await saveSession("stable", messages, { env });
    const script = 'import {renameSession,setSessionArchived} from "./src/sessions/store.ts"; const env={VANTA_HOME:process.argv[1]}; if(process.argv[2]==="rename")await renameSession("stable","From another process",env); else await setSessionArchived("stable",true,env);';
    await Promise.all(["rename", "archive"].map((action) => run(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script, home, action])));
    expect(await loadSession("stable", env)).toMatchObject({ title: "From another process", archived: true, messages });
  });

  it("rejects a stale full-snapshot save with its version precondition", async () => {
    await saveSession("stable", messages, { env });
    const original = (await loadSession("stable", env))!;
    await renameSession("stable", "A concurrent rename", env);
    await expect(saveSession("stable", [], { env, title: original.title, expectedVersion: sessionVersion(original) })).rejects.toThrow("changed since snapshot");
    expect(await loadSession("stable", env)).toMatchObject({ title: "A concurrent rename", messages });
    await expect(saveSession("stable", [], { env, expectedVersion: null })).rejects.toThrow("changed since snapshot");
  });

  it("derives the first-message title and preserves renamed metadata on later saves", async () => {
    await saveSession("stable", [], { env, title: "New chat", projectId: "original-project" });
    await saveSession("stable", messages, { env, title: undefined, projectId: undefined });
    expect(await loadSession("stable", env)).toMatchObject({ title: "Keep the original conversation", projectId: "original-project" });
    await renameSession("stable", "User-chosen title", env);
    await saveSession("stable", messages, { env, title: undefined });
    expect(await loadSession("stable", env)).toMatchObject({ title: "User-chosen title", projectId: "original-project" });
  });

  it("handles competing abandoned-lock reapers without evicting a new live owner", async () => {
    await saveSession("stable", messages, { env });
    await writeFile(`${path()}.lock`, JSON.stringify({ pid: 99999999, token: "dead-fixture" }));
    const script = 'import {renameSession,setSessionArchived} from "./src/sessions/store.ts";const env={VANTA_HOME:process.argv[1]};if(process.argv[2]==="rename")await renameSession("stable","After dead lock",env);else await setSessionArchived("stable",true,env);';
    await Promise.all(["rename", "archive"].map((action) => run(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script, home, action])));
    expect(await loadSession("stable", env)).toMatchObject({ title: "After dead lock", archived: true, messages });
    expect((await readdir(join(home, "sessions"))).some((file) => file.endsWith(".lock") || file.endsWith(".reap"))).toBe(false);
  });

  it("never evicts a live writer because its lock timestamp is old", async () => {
    await saveSession("stable", messages, { env });
    let completed = false;
    let child: Promise<unknown> | undefined;
    const marker = join(home, "writer-attempting");
    const script = 'import{renameSession}from"./src/sessions/store.ts";import{writeFile}from"node:fs/promises";await writeFile(process.argv[2],"ready");await renameSession("stable","After release",{VANTA_HOME:process.argv[1]});';
    await withSessionLock(path(), async () => {
      await utimes(`${path()}.lock`, new Date(0), new Date(0));
      child = run(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script, home, marker]).then(() => { completed = true; });
      const deadline = Date.now() + 5000;
      while (!(await readFile(marker, "utf8").catch(() => ""))) {
        if (Date.now() >= deadline) throw new Error("child did not attempt the writer lock");
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(completed).toBe(false);
      expect(JSON.parse(await readFile(`${path()}.lock`, "utf8"))).toMatchObject({ pid: process.pid });
    });
    await child;
    expect(await loadSession("stable", env)).toMatchObject({ title: "After release" });
  });

  it("rejects symlink files and session directories before writing external targets", async () => {
    await mkdir(join(home, "sessions"));
    const external = join(home, "outside.json");
    await writeFile(external, "must remain");
    await symlink(external, path());
    await expect(saveSession("stable", messages, { env })).rejects.toBeInstanceOf(SessionStoreUnreadableError);
    expect(await readFile(external, "utf8")).toBe("must remain");
    const linkedHome = join(home, "linked-home");
    await mkdir(linkedHome);
    await symlink(join(home, "sessions"), join(linkedHome, "sessions"));
    await expect(saveSession("other", messages, { env: { VANTA_HOME: linkedHome } })).rejects.toBeInstanceOf(SessionStoreUnreadableError);
    expect(await readdir(join(home, "sessions"))).toEqual(["stable.json"]);
  });

  it("rejects a symlink substituted after flush before replace", async () => {
    await saveSession("stable", messages, { env });
    const external = join(home, "external.json");
    await writeFile(external, "unchanged");
    await expect(atomicReplaceSessionFile(path(), "replacement", async () => {
      await rm(path()); await symlink(external, path());
    })).rejects.toBeInstanceOf(SessionStoreUnreadableError);
    expect(await readFile(external, "utf8")).toBe("unchanged");
  });

  it("writes owner-only files and retains a bounded one-file last-good snapshot", async () => {
    await saveSession("stable", messages, { env });
    await chmod(path(), 0o644);
    await Promise.all(Array.from({ length: 8 }, (_, index) => renameSession("stable", `Title ${index}`, env)));
    expect((await stat(path())).mode & 0o777).toBe(0o600);
    expect((await stat(`${path()}.last-good`)).mode & 0o777).toBe(0o600);
    expect(await readdir(join(home, "sessions"))).toEqual(["stable.json", "stable.json.last-good"]);
  });

  it("does not permit session identifiers to escape the sessions directory", async () => {
    await expect(saveSession("../outside", messages, { env })).rejects.toThrow("Session id");
    await expect(loadSession("../outside", env)).rejects.toThrow("Session id");
  });
});
