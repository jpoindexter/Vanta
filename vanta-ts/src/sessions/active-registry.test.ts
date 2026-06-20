import { describe, it, expect } from "vitest";
import {
  registerSession,
  listActiveSessions,
  deregisterSession,
  parseRegistry,
  pruneDead,
  type ActiveSession,
  type RegistryDeps,
} from "./active-registry.js";

/** In-memory registry deps: a single mutable "file" + a pid-liveness set. */
function makeDeps(opts: {
  initial?: string | null;
  alivePids?: number[];
  now?: string;
  failRead?: boolean;
  failWrite?: boolean;
} = {}): RegistryDeps & { content: () => string | null; writes: () => number } {
  let file: string | null = opts.initial ?? null;
  let writeCount = 0;
  const alive = new Set(opts.alivePids ?? []);
  return {
    read: async () => {
      if (opts.failRead) throw new Error("read boom");
      return file;
    },
    write: async (content) => {
      if (opts.failWrite) throw new Error("write boom");
      writeCount += 1;
      file = content;
    },
    isAlive: (pid) => alive.has(pid),
    now: () => new Date(opts.now ?? "2026-06-20T12:00:00.000Z"),
    content: () => file,
    writes: () => writeCount,
  };
}

const entry = (pid: number, sessionId = `s-${pid}`): Omit<ActiveSession, "startedAt"> => ({
  pid,
  sessionId,
  project: "/repo/vanta",
});

describe("parseRegistry — tolerant reader", () => {
  it("returns [] for a missing file (null)", () => {
    expect(parseRegistry(null)).toEqual([]);
  });

  it("returns [] for corrupt JSON", () => {
    expect(parseRegistry("{not json")).toEqual([]);
  });

  it("returns [] when the JSON is not an array", () => {
    expect(parseRegistry(JSON.stringify({ pid: 1 }))).toEqual([]);
  });

  it("drops rows that fail the schema, keeps valid ones", () => {
    const raw = JSON.stringify([
      { pid: 10, sessionId: "a", project: "/p", startedAt: "t" },
      { pid: "nope", sessionId: "b", project: "/p", startedAt: "t" }, // bad pid
      { sessionId: "c" }, // missing fields
    ]);
    const parsed = parseRegistry(raw);
    expect(parsed).toEqual([{ pid: 10, sessionId: "a", project: "/p", startedAt: "t" }]);
  });
});

describe("pruneDead — pure liveness filter", () => {
  it("keeps only entries whose pid is alive", () => {
    const entries: ActiveSession[] = [
      { pid: 1, sessionId: "a", project: "/p", startedAt: "t" },
      { pid: 2, sessionId: "b", project: "/p", startedAt: "t" },
    ];
    const live = pruneDead(entries, (pid) => pid === 1);
    expect(live.map((e) => e.pid)).toEqual([1]);
  });
});

describe("registerSession — appends", () => {
  it("appends an entry with an injected startedAt", async () => {
    const deps = makeDeps();
    await registerSession(entry(100), deps);
    const stored = parseRegistry(deps.content());
    expect(stored).toEqual([
      { pid: 100, sessionId: "s-100", project: "/repo/vanta", startedAt: "2026-06-20T12:00:00.000Z" },
    ]);
  });

  it("appends alongside existing entries", async () => {
    const deps = makeDeps({
      initial: JSON.stringify([{ pid: 1, sessionId: "a", project: "/p", startedAt: "t" }]),
    });
    await registerSession(entry(2), deps);
    expect(parseRegistry(deps.content()).map((e) => e.pid)).toEqual([1, 2]);
  });

  it("replaces a prior row for a reused pid (no double-register)", async () => {
    const deps = makeDeps({
      initial: JSON.stringify([{ pid: 5, sessionId: "old", project: "/p", startedAt: "t0" }]),
    });
    await registerSession(entry(5, "new"), deps);
    const stored = parseRegistry(deps.content());
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ pid: 5, sessionId: "new" });
  });

  it("honours an explicit startedAt when provided", async () => {
    const deps = makeDeps();
    await registerSession({ ...entry(7), startedAt: "2020-01-01T00:00:00.000Z" }, deps);
    expect(parseRegistry(deps.content())[0]?.startedAt).toBe("2020-01-01T00:00:00.000Z");
  });

  it("never throws when the write fails (best-effort)", async () => {
    const deps = makeDeps({ failWrite: true });
    await expect(registerSession(entry(1), deps)).resolves.toBeUndefined();
  });
});

describe("listActiveSessions — reads + prunes dead pids", () => {
  it("prunes entries whose pid is dead via injected isAlive", async () => {
    const deps = makeDeps({
      initial: JSON.stringify([
        { pid: 1, sessionId: "a", project: "/p", startedAt: "t" },
        { pid: 2, sessionId: "b", project: "/p", startedAt: "t" }, // dead
        { pid: 3, sessionId: "c", project: "/p", startedAt: "t" },
      ]),
      alivePids: [1, 3],
    });
    const live = await listActiveSessions(deps);
    expect(live.map((e) => e.pid)).toEqual([1, 3]);
  });

  it("persists the pruned list back to the registry (self-heal)", async () => {
    const deps = makeDeps({
      initial: JSON.stringify([
        { pid: 1, sessionId: "a", project: "/p", startedAt: "t" },
        { pid: 2, sessionId: "b", project: "/p", startedAt: "t" }, // dead → reaped
      ]),
      alivePids: [1],
    });
    await listActiveSessions(deps);
    expect(parseRegistry(deps.content()).map((e) => e.pid)).toEqual([1]);
  });

  it("returns [] on a missing registry", async () => {
    const deps = makeDeps({ initial: null });
    expect(await listActiveSessions(deps)).toEqual([]);
  });

  it("returns [] when the read fails (tolerant)", async () => {
    const deps = makeDeps({ failRead: true });
    expect(await listActiveSessions(deps)).toEqual([]);
  });

  it("still returns the live set when the rewrite fails", async () => {
    const deps = makeDeps({
      initial: JSON.stringify([{ pid: 1, sessionId: "a", project: "/p", startedAt: "t" }]),
      alivePids: [1],
      failWrite: true,
    });
    const live = await listActiveSessions(deps);
    expect(live.map((e) => e.pid)).toEqual([1]);
  });
});

describe("deregisterSession — removes by pid", () => {
  it("removes only the matching pid", async () => {
    const deps = makeDeps({
      initial: JSON.stringify([
        { pid: 1, sessionId: "a", project: "/p", startedAt: "t" },
        { pid: 2, sessionId: "b", project: "/p", startedAt: "t" },
      ]),
    });
    await deregisterSession(1, deps);
    expect(parseRegistry(deps.content()).map((e) => e.pid)).toEqual([2]);
  });

  it("is a no-op for a pid with no row (idempotent)", async () => {
    const deps = makeDeps({
      initial: JSON.stringify([{ pid: 2, sessionId: "b", project: "/p", startedAt: "t" }]),
    });
    await deregisterSession(999, deps);
    expect(parseRegistry(deps.content()).map((e) => e.pid)).toEqual([2]);
  });

  it("never throws when the write fails (best-effort)", async () => {
    const deps = makeDeps({ initial: "[]", failWrite: true });
    await expect(deregisterSession(1, deps)).resolves.toBeUndefined();
  });
});

describe("register → list → deregister round-trip", () => {
  it("a registered live session appears in the list, then is gone after deregister", async () => {
    const deps = makeDeps({ alivePids: [42] });
    await registerSession(entry(42), deps);
    let live = await listActiveSessions(deps);
    expect(live.map((e) => e.pid)).toEqual([42]);
    await deregisterSession(42, deps);
    live = await listActiveSessions(deps);
    expect(live).toEqual([]);
  });
});
