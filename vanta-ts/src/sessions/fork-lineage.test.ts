import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exportSession } from "./export.js";
import { forkSessionAt } from "./fork-at.js";
import { setSessionPinned } from "./pinning.js";
import { SessionSchema, sessionToMeta } from "./session-schema.js";
import { checkpointSessionMessages, forkSession, listAllSessions, loadSession, newSessionId, renameSession, saveSession, setSessionArchived, setSessionTrashed } from "./store.js";

let home: string;
let env: NodeJS.ProcessEnv;
const now = new Date("2026-10-28T10:00:00Z");
const messages = [{ role: "user" as const, content: "Parent conversation" }, { role: "assistant" as const, content: "Parent answer" }];
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), "vanta-fork-lineage-")); env = { VANTA_HOME: home }; });
afterEach(async () => { await rm(home, { recursive: true, force: true }); });

describe("persisted fork lineage", () => {
  it("keeps optional parent metadata while old records remain unchanged", async () => {
    const old = { id: "old", title: "Old", started: now.toISOString(), updated: now.toISOString(), messages };
    expect(SessionSchema.parse(old)).toEqual(old);
    const branch = SessionSchema.parse({ ...old, parentSessionId: "parent" });
    expect(branch).toHaveProperty("parentSessionId", "parent");
    expect(sessionToMeta(branch)).toHaveProperty("parentSessionId", "parent");
    await saveSession("old", messages, { env });
    const file = join(home, "sessions/old.json"), bytes = await readFile(file, "utf8");
    await loadSession("old", env);
    expect(await readFile(file, "utf8")).toBe(bytes);
    expect(JSON.parse(bytes)).not.toHaveProperty("parentSessionId");
  });

  it.each([forkSession, forkSessionAt])("retains immediate parent and project/model metadata across later saves", async (fork) => {
    await saveSession("parent", messages, { env, projectId: "project-a", cwd: "/private/project-a", providerId: "custom", modelId: "test-model" });
    const parentBefore = await readFile(join(home, "sessions/parent.json"), "utf8");
    const child = await fork("parent", { env, now });
    expect(child).toMatchObject({ parentSessionId: "parent", projectId: "project-a", cwd: "/private/project-a", providerId: "custom", modelId: "test-model", messages });
    const grandchild = await fork(child!.id, { env, now });
    expect(grandchild?.parentSessionId).toBe(child!.id);
    await saveSession(child!.id, [...messages, { role: "user", content: "Continue child" }], { env });
    await saveSession(child!.id, messages, { env, parentSessionId: "wrong-parent" });
    await checkpointSessionMessages(child!.id, messages, env);
    await renameSession(child!.id, "Renamed child", env);
    await setSessionPinned(child!.id, true, env);
    await setSessionArchived(child!.id, true, env);
    await setSessionTrashed(child!.id, true, env);
    expect(await loadSession(child!.id, env)).toMatchObject({ parentSessionId: "parent", projectId: "project-a", cwd: "/private/project-a" });
    expect((await listAllSessions(env)).find((row) => row.id === child!.id)?.parentSessionId).toBe("parent");
    expect(await readFile(join(home, "sessions/parent.json"), "utf8")).toBe(parentBefore);
  });

  it.each([forkSession, forkSessionAt])("never overwrites a source or sibling fork in the same second", async (fork) => {
    const id = newSessionId(now);
    await saveSession(id, messages, { env, now: now.toISOString() });
    const bytes = await readFile(join(home, `sessions/${id}.json`), "utf8");
    const first = await fork(id, { env, now }), second = await fork(id, { env, now });
    expect(new Set([id, first!.id, second!.id]).size).toBe(3);
    expect(await readFile(join(home, `sessions/${id}.json`), "utf8")).toBe(bytes);
    expect(await listAllSessions(env)).toHaveLength(3);
  });

  it("exports true parent metadata without system prompts or image bytes", () => {
    const session = SessionSchema.parse({ id: "child", title: "Child", started: now.toISOString(), updated: now.toISOString(), parentSessionId: "parent", messages: [
      { role: "system", content: "Private system instructions" },
      { role: "user", content: "Visible message", images: [{ mime: "image/png", dataBase64: "private-image-bytes" }] },
    ] });
    const exported = JSON.parse(exportSession(session, "json").content);
    expect(exported.parentSessionId).toBe("parent");
    expect(exported.messages).toEqual([{ role: "user", content: "Visible message" }]);
  });
});
