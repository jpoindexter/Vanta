import { describe, it, expect } from "vitest";
import {
  buildMemorySyncPlan,
  formatSyncPlan,
  runMemorySync,
  type MemoryAdapter,
  type MemoryFile,
  type RemoteFile,
  type ReadLocal,
} from "./drive-sync.js";

function local(name: string, hash: string, modifiedMs: number): MemoryFile {
  return { name, hash, modifiedMs };
}
function remote(name: string, modifiedMs: number, hash?: string): RemoteFile {
  return { name, hash, modifiedMs };
}

describe("buildMemorySyncPlan", () => {
  it("pushes a name that exists only locally", () => {
    const plan = buildMemorySyncPlan([local("1.md", "a", 100)], []);
    expect(plan.toPush).toEqual(["1.md"]);
    expect(plan.toPull).toEqual([]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.upToDate).toEqual([]);
  });

  it("pulls a name that exists only remotely", () => {
    const plan = buildMemorySyncPlan([], [remote("2.md", 100, "b")]);
    expect(plan.toPull).toEqual(["2.md"]);
    expect(plan.toPush).toEqual([]);
  });

  it("marks same-hash files up-to-date (no transfer)", () => {
    const plan = buildMemorySyncPlan([local("3.md", "same", 100)], [remote("3.md", 200, "same")]);
    expect(plan.upToDate).toEqual(["3.md"]);
    expect(plan.toPush).toEqual([]);
    expect(plan.toPull).toEqual([]);
    expect(plan.conflicts).toEqual([]);
  });

  it("pushes when content differs and local is newer", () => {
    const plan = buildMemorySyncPlan([local("4.md", "local", 200)], [remote("4.md", 100, "remote")]);
    expect(plan.toPush).toEqual(["4.md"]);
  });

  it("pulls when content differs and remote is newer", () => {
    const plan = buildMemorySyncPlan([local("5.md", "local", 100)], [remote("5.md", 200, "remote")]);
    expect(plan.toPull).toEqual(["5.md"]);
  });

  it("flags a conflict when content differs but mtimes are equal", () => {
    const plan = buildMemorySyncPlan([local("6.md", "local", 100)], [remote("6.md", 100, "remote")]);
    expect(plan.conflicts).toEqual(["6.md"]);
    expect(plan.toPush).toEqual([]);
    expect(plan.toPull).toEqual([]);
  });

  it("first backup (empty remote) pushes everything", () => {
    const plan = buildMemorySyncPlan(
      [local("a.md", "x", 1), local("b.md", "y", 2)],
      [],
    );
    expect(plan.toPush).toEqual(["a.md", "b.md"]);
    expect(plan.toPull).toEqual([]);
  });

  it("empty local + empty remote → all empty buckets", () => {
    const plan = buildMemorySyncPlan([], []);
    expect(plan).toEqual({ toPush: [], toPull: [], conflicts: [], upToDate: [] });
  });

  it("treats a hashless remote with equal mtime as a conflict", () => {
    // No remote hash → can't prove identical; equal mtime → unresolvable.
    const plan = buildMemorySyncPlan([local("7.md", "local", 100)], [remote("7.md", 100)]);
    expect(plan.conflicts).toEqual(["7.md"]);
  });

  it("handles a mixed corpus in one plan", () => {
    const localFiles = [
      local("only-local.md", "l", 10),
      local("same.md", "eq", 10),
      local("local-newer.md", "l2", 30),
      local("remote-newer.md", "l3", 10),
      local("conflict.md", "l4", 20),
    ];
    const remoteFiles = [
      remote("same.md", 50, "eq"),
      remote("local-newer.md", 10, "r2"),
      remote("remote-newer.md", 40, "r3"),
      remote("conflict.md", 20, "r4"),
      remote("only-remote.md", 5, "r5"),
    ];
    const plan = buildMemorySyncPlan(localFiles, remoteFiles);
    expect(plan.toPush).toEqual(["only-local.md", "local-newer.md"]);
    expect(plan.toPull).toEqual(["remote-newer.md", "only-remote.md"]);
    expect(plan.upToDate).toEqual(["same.md"]);
    expect(plan.conflicts).toEqual(["conflict.md"]);
  });
});

describe("formatSyncPlan", () => {
  it("summarizes counts in one line", () => {
    const plan = {
      toPush: ["a", "b"],
      toPull: ["c"],
      conflicts: ["d", "e", "f"],
      upToDate: ["g", "h", "i", "j"],
    };
    expect(formatSyncPlan(plan)).toBe("2 push · 1 pull · 3 conflicts · 4 up-to-date");
  });

  it("summarizes an all-zero plan", () => {
    expect(formatSyncPlan({ toPush: [], toPull: [], conflicts: [], upToDate: [] })).toBe(
      "0 push · 0 pull · 0 conflicts · 0 up-to-date",
    );
  });
});

/** A fake adapter that records pushes/pulls and serves a fixed remote listing. */
function fakeAdapter(remoteList: RemoteFile[]): {
  adapter: MemoryAdapter;
  pushes: Array<{ name: string; content: string }>;
  pulls: string[];
} {
  const pushes: Array<{ name: string; content: string }> = [];
  const pulls: string[] = [];
  const adapter: MemoryAdapter = {
    list: async () => remoteList,
    push: async (name, content) => {
      pushes.push({ name, content });
    },
    pull: async (name) => {
      pulls.push(name);
      return `remote-content-of-${name}`;
    },
  };
  return { adapter, pushes, pulls };
}

const readLocal: ReadLocal = async (name) => `local-content-of-${name}`;

describe("runMemorySync", () => {
  it("pushes toPush and pulls toPull via the injected adapter", async () => {
    const localFiles = [
      local("push-me.md", "l", 100), // only local → push
      local("conflict.md", "l", 50), // both, diff hash, equal mtime → conflict (skipped)
    ];
    const { adapter, pushes, pulls } = fakeAdapter([
      remote("conflict.md", 50, "r"),
      remote("pull-me.md", 10, "r2"), // only remote → pull
    ]);

    const result = await runMemorySync(localFiles, adapter, readLocal);

    expect(result.pushed).toEqual(["push-me.md"]);
    expect(result.pulled).toEqual(["pull-me.md"]);
    expect(result.conflicts).toEqual(["conflict.md"]);
    expect(pushes).toEqual([{ name: "push-me.md", content: "local-content-of-push-me.md" }]);
    expect(pulls).toEqual(["pull-me.md"]);
  });

  it("SKIPS conflicts — never auto-overwrites either side", async () => {
    const localFiles = [local("c.md", "l", 100)];
    const { adapter, pushes, pulls } = fakeAdapter([remote("c.md", 100, "r")]);

    const result = await runMemorySync(localFiles, adapter, readLocal);

    expect(result.conflicts).toEqual(["c.md"]);
    expect(result.pushed).toEqual([]);
    expect(result.pulled).toEqual([]);
    expect(pushes).toEqual([]); // no push of the conflicted file
    expect(pulls).toEqual([]); // no pull of the conflicted file
  });

  it("records (does not throw) a per-file push error and continues", async () => {
    const localFiles = [local("bad.md", "l", 100), local("good.md", "l", 100)];
    const { adapter, pushes } = fakeAdapter([]);
    adapter.push = async (name, content) => {
      if (name === "bad.md") throw new Error("upload failed");
      pushes.push({ name, content });
    };

    const result = await runMemorySync(localFiles, adapter, readLocal);

    expect(result.pushed).toEqual(["good.md"]); // bad.md recorded as not-pushed, not thrown
    expect(result.conflicts).toEqual([]);
    expect(pushes).toEqual([{ name: "good.md", content: "local-content-of-good.md" }]);
  });

  it("records (does not throw) a per-file pull error and continues", async () => {
    const { adapter, pulls } = fakeAdapter([
      remote("bad.md", 10, "r"),
      remote("good.md", 10, "r"),
    ]);
    adapter.pull = async (name) => {
      if (name === "bad.md") throw new Error("download failed");
      pulls.push(name);
      return "ok";
    };

    const result = await runMemorySync([], adapter, readLocal);

    expect(result.pulled).toEqual(["good.md"]);
    expect(pulls).toEqual(["good.md"]);
  });

  it("first backup: empty remote → push-all", async () => {
    const localFiles = [local("a.md", "x", 1), local("b.md", "y", 2)];
    const { adapter, pushes } = fakeAdapter([]);

    const result = await runMemorySync(localFiles, adapter, readLocal);

    expect(result.pushed).toEqual(["a.md", "b.md"]);
    expect(result.pulled).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(pushes.map((p) => p.name)).toEqual(["a.md", "b.md"]);
  });

  it("a failed remote listing degrades to an empty remote (push-all), never throws", async () => {
    const localFiles = [local("a.md", "x", 1)];
    const { adapter, pushes } = fakeAdapter([]);
    adapter.list = async () => {
      throw new Error("network down");
    };

    const result = await runMemorySync(localFiles, adapter, readLocal);

    expect(result.pushed).toEqual(["a.md"]);
    expect(pushes.map((p) => p.name)).toEqual(["a.md"]);
  });

  it("empty local + empty remote → all-zero result", async () => {
    const { adapter, pushes, pulls } = fakeAdapter([]);
    const result = await runMemorySync([], adapter, readLocal);
    expect(result).toEqual({ pushed: [], pulled: [], conflicts: [] });
    expect(pushes).toEqual([]);
    expect(pulls).toEqual([]);
  });
});
