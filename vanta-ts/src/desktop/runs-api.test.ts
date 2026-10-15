import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDesktopServer } from "./server.js";
import { loadSession, saveSession } from "../sessions/store.js";
import { captureRunInputs, loadRun, saveRun, type RunRecord } from "../runs/store.js";
import { loadDesktopSessionDraft } from "./session-draft-store.js";
import type { DesktopState } from "./handlers.js";

describe("desktop run library API", () => {
  let home: string;
  let root: string;
  let server: ReturnType<typeof createDesktopServer>;
  let base: string;
  let state: DesktopState;
  const originalHome = process.env.VANTA_HOME;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-runs-api-home-"));
    root = await mkdtemp(join(tmpdir(), "vanta-runs-api-root-"));
    process.env.VANTA_HOME = home;
    state = {
      root,
      sessionId: "existing-session",
      sessionStarted: "2026-07-24T08:00:00.000Z",
      providerId: "openai",
      modelId: "gpt-5.5",
      setup: {
        provider: { modelId: () => "gpt-5.5" },
        registry: { list: () => [], get: () => undefined },
        safety: {},
        systemPrompt: "You are Vanta.",
        goals: [],
      } as never,
    };
    server = createDesktopServer(root, { sessions: new Map([["run-client", state]]) });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("desktop server did not bind");
    base = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (originalHome === undefined) delete process.env.VANTA_HOME;
    else process.env.VANTA_HOME = originalHome;
    await Promise.all([rm(home, { recursive: true, force: true }), rm(root, { recursive: true, force: true })]);
  });

  function post(body: unknown): Promise<Response> {
    return fetch(`${base}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-session-id": "run-client" },
      body: JSON.stringify(body),
    });
  }

  it("lists captured and explicitly incomplete legacy runs, then saves either one", async () => {
    await saveSession("legacy-session", [
      { role: "user", content: "Summarize the guide" },
      { role: "assistant", content: "Legacy output" },
    ], { env: process.env, now: "2026-07-24T09:00:00.000Z" });
    const captured: RunRecord = {
      version: 1,
      id: "captured-run",
      sessionId: "captured-session",
      turnIndex: 0,
      title: "Inspect source",
      prompt: "Inspect source",
      projectRoot: root,
      startedAt: "2026-07-24T10:00:00.000Z",
      completedAt: "2026-07-24T10:01:00.000Z",
      status: "done",
      saved: false,
      tags: [],
      provenance: "captured",
      lineage: { mode: "original" },
      inputs: [],
      events: [],
      finalOutput: "Captured output",
    };
    await saveRun(captured, process.env);

    const listed = await (await fetch(`${base}/api/runs`)).json() as RunRecord[];
    expect(listed).toHaveLength(2);
    expect(listed).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "captured-run", provenance: "captured" }),
      expect.objectContaining({ id: "legacy-legacy-session-0", provenance: "derived", saved: false }),
    ]));

    expect((await post({ action: "save", id: "captured-run", saved: true })).status).toBe(200);
    expect(await loadRun("captured-run", process.env)).toMatchObject({ saved: true });
    expect((await post({ action: "save", id: "legacy-legacy-session-0", saved: true })).status).toBe(200);
    expect(await loadRun("legacy-legacy-session-0", process.env)).toMatchObject({ provenance: "derived", saved: true });
    expect((await post({ action: "delete", id: "captured-run" })).status).toBe(200);
    expect(await loadRun("captured-run", process.env)).toBeNull();
  });

  it("previews drift and prepares fork or replay as a fresh session with lineage", async () => {
    await writeFile(join(root, "guide.md"), "original");
    const inputs = await captureRunInputs(root, ["guide.md"], "reusable-run", process.env);
    const reusable: RunRecord = {
      version: 1,
      id: "reusable-run",
      sessionId: "source-session",
      turnIndex: 0,
      title: "Reuse guide",
      prompt: "Summarize the guide",
      projectRoot: root,
      providerId: "openai",
      modelId: "gpt-5.5",
      startedAt: "2026-07-24T10:00:00.000Z",
      completedAt: "2026-07-24T10:01:00.000Z",
      status: "done",
      saved: true,
      tags: [],
      provenance: "captured",
      lineage: { mode: "original" },
      inputs,
      events: [],
      finalOutput: "Summary",
    };
    await saveRun(reusable, process.env);

    const preview = await (await post({ action: "preview", id: reusable.id })).json() as { canExecute: boolean };
    expect(preview.canExecute).toBe(true);
    const fork = await (await post({ action: "fork", id: reusable.id })).json() as { sessionId: string; draft: string; lineage: { mode: string; parentRunId: string } };
    expect(fork).toMatchObject({ lineage: { mode: "fork", parentRunId: reusable.id } });
    expect(fork.draft).toContain("@guide.md");
    expect(await loadSession(fork.sessionId, process.env)).not.toBeNull();
    expect(await loadDesktopSessionDraft(root, fork.sessionId, process.env)).toMatchObject({ exists: true, value: fork.draft });

    await writeFile(join(root, "guide.md"), "changed");
    expect((await post({ action: "replay", id: reusable.id })).status).toBe(409);
    const replay = await (await post({ action: "replay", id: reusable.id, acknowledgeDrift: true })).json() as { sessionId: string; lineage: { mode: string } };
    expect(replay.lineage.mode).toBe("replay");
    expect(state.forceFreshApprovals).toBe(true);
    expect(await loadSession(replay.sessionId, process.env)).not.toBeNull();

    const newSession = await fetch(`${base}/api/sessions/new`, {
      method: "POST",
      headers: { "x-session-id": "run-client" },
    });
    expect(newSession.status).toBe(200);
    expect(state.pendingRunLineage).toBeUndefined();
    expect(state.forceFreshApprovals).toBe(false);
  });
});
