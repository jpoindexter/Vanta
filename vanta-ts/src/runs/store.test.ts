import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  approvalRunEvent,
  captureRunInputs,
  deleteUnsavedRunsForSession,
  listRuns,
  loadRun,
  newRunId,
  previewReplay,
  runEventFromTool,
  saveRun,
  setRunSaved,
  type RunRecord,
} from "./store.js";

describe("run library store", () => {
  let home: string;
  let root: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-runs-home-"));
    root = await mkdtemp(join(tmpdir(), "vanta-runs-root-"));
    env = { VANTA_HOME: home };
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  });

  function record(patch: Partial<RunRecord> = {}): RunRecord {
    return {
      version: 1,
      id: patch.id ?? newRunId(),
      sessionId: "session-1",
      turnIndex: 0,
      title: "Inspect README",
      prompt: "Inspect README",
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
      finalOutput: "Done",
      ...patch,
    };
  }

  it("round-trips, searches, and saves a run without changing its transcript fields", async () => {
    const original = await saveRun(record(), env);
    expect(await loadRun(original.id, env)).toEqual(original);
    expect(await listRuns({ query: "README" }, env)).toHaveLength(1);
    expect(await listRuns({ savedOnly: true }, env)).toEqual([]);
    await setRunSaved(original.id, true, env);
    expect(await listRuns({ savedOnly: true }, env)).toMatchObject([{ id: original.id, saved: true }]);
  });

  it("removes unsaved runs with a deleted session but preserves saved library runs", async () => {
    const unsaved = await saveRun(record({ id: "unsaved" }), env);
    await saveRun(record({ id: "saved", saved: true }), env);
    expect(await deleteUnsavedRunsForSession(unsaved.sessionId, env)).toBe(1);
    expect(await loadRun("unsaved", env)).toBeNull();
    expect(await loadRun("saved", env)).not.toBeNull();
  });

  it("snapshots safe files and excludes secret-bearing inputs", async () => {
    await writeFile(join(root, "guide.md"), "safe guide");
    await writeFile(join(root, "secret.txt"), "sk-abcdefghijklmnopqrstuvwxyz");
    const inputs = await captureRunInputs(root, ["guide.md", "secret.txt", ".env"], "run-1", env);
    expect(inputs).toMatchObject([
      { path: "guide.md", capture: "snapshotted" },
      { path: "secret.txt", capture: "redacted" },
      { path: ".env", capture: "redacted" },
    ]);
    const snapshot = inputs[0]?.snapshotRef;
    expect(snapshot).toBeTruthy();
    expect(await readFile(join(home, "runs", snapshot!), "utf8")).toBe("safe guide");
  });

  it("redacts secret slots and approval reasons before persistence", () => {
    const start = runEventFromTool({ type: "tool_start", name: "web_fetch", args: { url: "https://x.test?token=abc", apiKey: "plain-secret" } });
    const approval = approvalRunEvent("web_fetch", "Authorization: Bearer abcdefghijklmnopqrstuvwxyz", "allow");
    expect(start.args).toEqual({ url: "https://x.test?token=***", apiKey: "***" });
    expect(approval.approval?.reason).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });

  it("redacts credentials from every free-text record boundary", async () => {
    const secret = "sk-abcdefghijklmnopqrstuvwxyz";
    const stored = await saveRun(record({
      title: `Use ${secret}`,
      prompt: `Prompt ${secret}`,
      finalOutput: `Output ${secret}`,
      events: [{ at: "2026-07-24T10:00:00.000Z", kind: "note", output: secret }],
    }), env);
    const raw = await readFile(join(home, "runs", `${stored.id}.json`), "utf8");
    expect(raw).not.toContain(secret);
    expect(raw).toContain("[REDACTED]");
  });

  it("blocks replay preview when an input changed or disappeared", async () => {
    await writeFile(join(root, "guide.md"), "before");
    const inputs = await captureRunInputs(root, ["guide.md", "missing.md"], "run-2", env);
    const stored = record({ inputs });
    await writeFile(join(root, "guide.md"), "after");
    const preview = await previewReplay(stored, { projectRoot: root, tools: [], providerId: "openai", modelId: "gpt" });
    expect(preview.canExecute).toBe(false);
    expect(preview.inputs.map((input) => input.state)).toEqual(["changed", "missing"]);
  });
});
