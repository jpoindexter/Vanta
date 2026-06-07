import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readStack, addTask, closeTask, blockTask, parkTask, reopenTask, touchTask } from "./store.js";

async function tempDataDir(): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), "vanta-taskstack-"));
  const dir = join(base, ".vanta");
  await mkdir(dir, { recursive: true });
  return dir;
}

const FIXED_NOW = "2026-01-01T00:00:00.000Z";
const now = () => FIXED_NOW;

describe("readStack", () => {
  it("returns an empty stack for a missing file", async () => {
    const dir = await tempDataDir();
    const stack = await readStack(dir);
    expect(stack).toEqual({ tasks: [] });
  });

  it("returns an empty stack for a corrupt file", async () => {
    const dir = await tempDataDir();
    await writeFile(join(dir, "task-stack.json"), "{{not valid json", "utf8");
    const stack = await readStack(dir);
    expect(stack).toEqual({ tasks: [] });
  });

  it("returns an empty stack when file has invalid shape", async () => {
    const dir = await tempDataDir();
    await writeFile(join(dir, "task-stack.json"), JSON.stringify({ wrong: true }), "utf8");
    const stack = await readStack(dir);
    expect(stack).toEqual({ tasks: [] });
  });
});

describe("addTask", () => {
  let dir: string;
  beforeEach(async () => { dir = await tempDataDir(); });

  it("adds a task with pending status and returns it", async () => {
    const r = await addTask(dir, { title: "Do the thing", why: "because" }, now);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("guard");
    expect(r.value.title).toBe("Do the thing");
    expect(r.value.status).toBe("pending");
    expect(r.value.createdAt).toBe(FIXED_NOW);
    expect(r.value.source).toBe("user");
  });

  it("persists the task so readStack sees it", async () => {
    await addTask(dir, { title: "Persisted", why: "test" }, now);
    const stack = await readStack(dir);
    expect(stack.tasks).toHaveLength(1);
    expect(stack.tasks[0]!.title).toBe("Persisted");
  });

  it("accumulates multiple tasks", async () => {
    await addTask(dir, { title: "First", why: "a" }, now);
    await addTask(dir, { title: "Second", why: "b" }, now);
    const stack = await readStack(dir);
    expect(stack.tasks).toHaveLength(2);
  });

  it("assigns unique ids for tasks added in the same tick", async () => {
    const r1 = await addTask(dir, { title: "T1", why: "x" }, now);
    const r2 = await addTask(dir, { title: "T2", why: "x" }, now);
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) throw new Error("guard");
    expect(r1.value.id).not.toBe(r2.value.id);
  });

  it("respects explicit source, priority, confidence", async () => {
    const r = await addTask(
      dir,
      { title: "T", why: "w", source: "agent", priority: "high", confidence: "verified" },
      now,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("guard");
    expect(r.value.source).toBe("agent");
    expect(r.value.priority).toBe("high");
    expect(r.value.confidence).toBe("verified");
  });
});

describe("closeTask", () => {
  it("marks the task closed", async () => {
    const dir = await tempDataDir();
    const added = await addTask(dir, { title: "Close me", why: "x" }, now);
    expect(added.ok).toBe(true);
    if (!added.ok) throw new Error("guard");
    const r = await closeTask(added.value.id)(dir, now);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("guard");
    expect(r.value.status).toBe("closed");
  });

  it("returns error for non-existent id", async () => {
    const dir = await tempDataDir();
    const r = await closeTask("no-such-id")(dir, now);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("guard");
    expect(r.error).toContain("not found");
  });
});

describe("blockTask", () => {
  it("marks task blocked with the reason", async () => {
    const dir = await tempDataDir();
    const added = await addTask(dir, { title: "Block me", why: "x" }, now);
    if (!added.ok) throw new Error("guard");
    const r = await blockTask(added.value.id, "waiting on API key")(dir, now);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("guard");
    expect(r.value.status).toBe("blocked");
    expect(r.value.blocker).toBe("waiting on API key");
  });

  it("returns error for non-existent id", async () => {
    const dir = await tempDataDir();
    const r = await blockTask("nope", "reason")(dir, now);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("guard");
    expect(r.error).toContain("not found");
  });
});

describe("parkTask", () => {
  it("marks task parked", async () => {
    const dir = await tempDataDir();
    const added = await addTask(dir, { title: "Park me", why: "x" }, now);
    if (!added.ok) throw new Error("guard");
    const r = await parkTask(added.value.id)(dir, now);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("guard");
    expect(r.value.status).toBe("parked");
  });

  it("returns error for non-existent id", async () => {
    const dir = await tempDataDir();
    const r = await parkTask("nope")(dir, now);
    expect(r.ok).toBe(false);
  });
});

describe("reopenTask", () => {
  it("re-opens a parked task as pending and clears blocker", async () => {
    const dir = await tempDataDir();
    const added = await addTask(dir, { title: "Reopen me", why: "x" }, now);
    if (!added.ok) throw new Error("guard");
    const id = added.value.id;
    await parkTask(id)(dir, now);
    const r = await reopenTask(id)(dir, now);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("guard");
    expect(r.value.status).toBe("pending");
    expect(r.value.blocker).toBeUndefined();
  });

  it("re-opens a blocked task as pending and clears blocker", async () => {
    const dir = await tempDataDir();
    const added = await addTask(dir, { title: "Reopen blocked", why: "x" }, now);
    if (!added.ok) throw new Error("guard");
    const id = added.value.id;
    await blockTask(id, "some block")(dir, now);
    const r = await reopenTask(id)(dir, now);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("guard");
    expect(r.value.status).toBe("pending");
    expect(r.value.blocker).toBeUndefined();
  });

  it("returns error for non-existent id", async () => {
    const dir = await tempDataDir();
    const r = await reopenTask("nope")(dir, now);
    expect(r.ok).toBe(false);
  });
});

describe("touchTask", () => {
  it("updates lastTouchedAt without changing status", async () => {
    const dir = await tempDataDir();
    const added = await addTask(dir, { title: "Touch me", why: "x" }, now);
    if (!added.ok) throw new Error("guard");
    const laterNow = () => "2026-06-01T12:00:00.000Z";
    const r = await touchTask(added.value.id, dir, laterNow);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("guard");
    expect(r.value.lastTouchedAt).toBe("2026-06-01T12:00:00.000Z");
    expect(r.value.status).toBe("pending");
  });

  it("returns error for non-existent id", async () => {
    const dir = await tempDataDir();
    const r = await touchTask("nope", dir, now);
    expect(r.ok).toBe(false);
  });
});

describe("round-trip serialisation", () => {
  it("persists and re-reads a task with all optional fields", async () => {
    const dir = await tempDataDir();
    const r = await addTask(
      dir,
      {
        title: "Full task",
        why: "round-trip",
        source: "roadmap",
        priority: "high",
        confidence: "inferred",
        nextAction: "write tests",
        relatedRoadmapId: "EF-TASKSTACK",
        relatedFiles: ["src/task-stack/store.ts"],
      },
      now,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("guard");

    const stack = await readStack(dir);
    const task = stack.tasks.find((t) => t.title === "Full task");
    expect(task).toBeDefined();
    expect(task!.priority).toBe("high");
    expect(task!.confidence).toBe("inferred");
    expect(task!.nextAction).toBe("write tests");
    expect(task!.relatedRoadmapId).toBe("EF-TASKSTACK");
    expect(task!.relatedFiles).toEqual(["src/task-stack/store.ts"]);
  });

  it("preserves all tasks across multiple transitions", async () => {
    const dir = await tempDataDir();
    const a = await addTask(dir, { title: "A", why: "a" }, now);
    const b = await addTask(dir, { title: "B", why: "b" }, now);
    if (!a.ok || !b.ok) throw new Error("guard");

    await closeTask(a.value.id)(dir, now);
    await blockTask(b.value.id, "reason")(dir, now);

    const stack = await readStack(dir);
    expect(stack.tasks).toHaveLength(2);
    const ta = stack.tasks.find((t) => t.title === "A")!;
    const tb = stack.tasks.find((t) => t.title === "B")!;
    expect(ta.status).toBe("closed");
    expect(tb.status).toBe("blocked");
    expect(tb.blocker).toBe("reason");
  });
});
