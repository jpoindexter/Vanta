import { describe, it, expect } from "vitest";
import {
  createTask,
  getTask,
  listTasks,
  updateTask,
  stopTask,
  appendTaskOutput,
  readTaskOutput,
  parseTasks,
  type TaskStoreDeps,
} from "./task-store.js";

// In-memory store harness: an injected read/write over a mutable cell + a tick
// clock. No real disk, no real time — every op is exercised purely.
function makeDeps(initial: string | null = null): TaskStoreDeps & { peek: () => string | null } {
  let cell: string | null = initial;
  let clock = 1000;
  return {
    read: async () => cell,
    write: async (content) => {
      cell = content;
    },
    now: () => (clock += 1),
    peek: () => cell,
  };
}

describe("createTask + getTask", () => {
  it("creates a pending task that round-trips through getTask", async () => {
    const deps = makeDeps();
    const created = await createTask({ id: "t1", title: "ship it" }, deps);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value).toMatchObject({ id: "t1", title: "ship it", status: "pending", output: [] });
    expect(created.value.createdMs).toBeGreaterThan(0);

    const fetched = await getTask("t1", deps);
    expect(fetched.ok).toBe(true);
    if (!fetched.ok) return;
    expect(fetched.value).toEqual(created.value);
  });

  it("rejects a duplicate id as an error value (does not overwrite)", async () => {
    const deps = makeDeps();
    await createTask({ id: "dup", title: "first" }, deps);
    const second = await createTask({ id: "dup", title: "second" }, deps);
    expect(second).toEqual({ ok: false, error: 'task id "dup" already exists' });
    const fetched = await getTask("dup", deps);
    expect(fetched.ok && fetched.value.title).toBe("first");
  });

  it("rejects empty id or title", async () => {
    const deps = makeDeps();
    expect(await createTask({ id: "  ", title: "x" }, deps)).toEqual({
      ok: false,
      error: "task id must be non-empty",
    });
    expect(await createTask({ id: "x", title: "  " }, deps)).toEqual({
      ok: false,
      error: "task title must be non-empty",
    });
  });

  it("getTask returns an error value for an unknown id", async () => {
    const deps = makeDeps();
    expect(await getTask("nope", deps)).toEqual({ ok: false, error: 'task "nope" not found' });
  });
});

describe("listTasks", () => {
  it("lists all tasks, then filters by status", async () => {
    const deps = makeDeps();
    await createTask({ id: "a", title: "A" }, deps);
    await createTask({ id: "b", title: "B" }, deps);
    await updateTask("b", { status: "running" }, deps);

    const all = await listTasks(undefined, deps);
    expect(all.ok && all.value.map((t) => t.id)).toEqual(["a", "b"]);

    const running = await listTasks({ status: "running" }, deps);
    expect(running.ok && running.value.map((t) => t.id)).toEqual(["b"]);

    const pending = await listTasks({ status: "pending" }, deps);
    expect(pending.ok && pending.value.map((t) => t.id)).toEqual(["a"]);
  });

  it("returns [] (ok) on an empty store", async () => {
    const deps = makeDeps();
    expect(await listTasks(undefined, deps)).toEqual({ ok: true, value: [] });
  });
});

describe("updateTask", () => {
  it("patches status and result together along a legal edge", async () => {
    const deps = makeDeps();
    await createTask({ id: "u", title: "work" }, deps);
    await updateTask("u", { status: "running" }, deps);
    const done = await updateTask("u", { status: "done", result: "42 widgets" }, deps);
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.value).toMatchObject({ status: "done", result: "42 widgets" });
  });

  it("rejects an illegal transition (done→running) as an error value, store untouched", async () => {
    const deps = makeDeps();
    await createTask({ id: "x", title: "t" }, deps);
    await updateTask("x", { status: "running" }, deps);
    await updateTask("x", { status: "done" }, deps);

    const illegal = await updateTask("x", { status: "running" }, deps);
    expect(illegal).toEqual({
      ok: false,
      error: "illegal transition done→running; allowed: none",
    });
    const after = await getTask("x", deps);
    expect(after.ok && after.value.status).toBe("done"); // unchanged
  });

  it("rejects pending→done (must pass through running)", async () => {
    const deps = makeDeps();
    await createTask({ id: "p", title: "t" }, deps);
    const r = await updateTask("p", { status: "done" }, deps);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("illegal transition pending→done");
  });

  it("allows a result-only patch with no status change", async () => {
    const deps = makeDeps();
    await createTask({ id: "r", title: "t" }, deps);
    const patched = await updateTask("r", { result: "note" }, deps);
    expect(patched.ok && patched.value).toMatchObject({ status: "pending", result: "note" });
  });

  it("errors when the task is missing", async () => {
    const deps = makeDeps();
    expect(await updateTask("ghost", { status: "running" }, deps)).toEqual({
      ok: false,
      error: 'task "ghost" not found',
    });
  });
});

describe("stopTask", () => {
  it("stops a pending task", async () => {
    const deps = makeDeps();
    await createTask({ id: "s1", title: "t" }, deps);
    const stopped = await stopTask("s1", deps);
    expect(stopped.ok && stopped.value.status).toBe("stopped");
  });

  it("stops a running task", async () => {
    const deps = makeDeps();
    await createTask({ id: "s2", title: "t" }, deps);
    await updateTask("s2", { status: "running" }, deps);
    const stopped = await stopTask("s2", deps);
    expect(stopped.ok && stopped.value.status).toBe("stopped");
  });

  it("refuses to stop a done task (only pending/running are stoppable)", async () => {
    const deps = makeDeps();
    await createTask({ id: "s3", title: "t" }, deps);
    await updateTask("s3", { status: "running" }, deps);
    await updateTask("s3", { status: "done" }, deps);
    const r = await stopTask("s3", deps);
    expect(r).toEqual({ ok: false, error: 'cannot stop task "s3" from status done' });
  });

  it("errors when the task is missing", async () => {
    const deps = makeDeps();
    expect(await stopTask("nope", deps)).toEqual({ ok: false, error: 'task "nope" not found' });
  });
});

describe("appendTaskOutput + readTaskOutput", () => {
  it("accumulates appended lines in order and reads them back", async () => {
    const deps = makeDeps();
    await createTask({ id: "o", title: "t" }, deps);
    await appendTaskOutput("o", "line 1", deps);
    await appendTaskOutput("o", "line 2", deps);
    const out = await readTaskOutput("o", deps);
    expect(out).toEqual({ ok: true, value: ["line 1", "line 2"] });
  });

  it("readTaskOutput is [] for a fresh task", async () => {
    const deps = makeDeps();
    await createTask({ id: "fresh", title: "t" }, deps);
    expect(await readTaskOutput("fresh", deps)).toEqual({ ok: true, value: [] });
  });

  it("both error when the task is missing", async () => {
    const deps = makeDeps();
    expect(await appendTaskOutput("x", "l", deps)).toEqual({ ok: false, error: 'task "x" not found' });
    expect(await readTaskOutput("x", deps)).toEqual({ ok: false, error: 'task "x" not found' });
  });
});

describe("tolerant reader", () => {
  it("parseTasks → [] on null, corrupt JSON, non-array, and drops bad rows", () => {
    expect(parseTasks(null)).toEqual([]);
    expect(parseTasks("{not json")).toEqual([]);
    expect(parseTasks('{"id":"x"}')).toEqual([]); // object, not array
    const mixed = JSON.stringify([
      { id: "good", title: "ok", status: "pending", output: [], createdMs: 1, updatedMs: 1 },
      { id: "bad", status: "pending" }, // missing title/output/timestamps
      { nonsense: true },
    ]);
    expect(parseTasks(mixed).map((t) => t.id)).toEqual(["good"]);
  });

  it("ops degrade to empty/not-found over a corrupt store (never throw)", async () => {
    const deps = makeDeps("<<<garbage>>>");
    expect(await listTasks(undefined, deps)).toEqual({ ok: true, value: [] });
    expect(await getTask("any", deps)).toEqual({ ok: false, error: 'task "any" not found' });
    // a create over a corrupt store still succeeds (corrupt rows dropped, then append)
    const created = await createTask({ id: "new", title: "t" }, deps);
    expect(created.ok).toBe(true);
  });

  it("persists valid JSON that round-trips through parseTasks", async () => {
    const deps = makeDeps();
    await createTask({ id: "persist", title: "t" }, deps);
    const raw = deps.peek();
    expect(raw).not.toBeNull();
    expect(parseTasks(raw).map((t) => t.id)).toEqual(["persist"]);
  });
});
