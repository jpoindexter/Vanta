import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { enqueueAsyncResult } from "./async-delegate.js";
import { runReplLoop, type ReplDeps } from "../interactive-repl.js";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vanta-background-review-"));
  roots.push(root);
  return root;
}

const row = (id: string, ok = true) => ({
  id, goal: "Private worker", output: "Fixture summary", finishedAt: "2026-10-27T00:00:00Z",
  ok, ...(ok ? {} : { effectDisposition: "unknown" as const }),
});

async function idle(dataDir: string, runUserTurn = vi.fn(async () => {})): Promise<typeof runUserTurn> {
  vi.spyOn(console, "log").mockImplementation(() => {});
  await runReplLoop({ ctx: { dataDir }, runUserTurn,
    rl: { question: async () => { throw new Error("Private EOF"); } },
  } as unknown as ReplDeps);
  return runUserTurn;
}

describe("actual background idle boundary", () => {
  it("holds uncertainty and its follower across repeated cold reads", async () => {
    const root = await fixture();
    await enqueueAsyncResult(root, row("uncertain", false));
    await enqueueAsyncResult(root, row("ordinary"));
    expect(await idle(root)).not.toHaveBeenCalled();
    expect(await idle(root)).not.toHaveBeenCalled();
    expect(await readFile(join(root, "async-delegate.jsonl"), "utf8")).toContain("uncertain");
  });

  it("never overwrites an old draining claim with new ordinary work", async () => {
    const root = await fixture();
    const orphan = JSON.stringify(row("uncertain", false)) + "\n";
    await writeFile(join(root, "async-delegate.jsonl.draining"), orphan);
    await enqueueAsyncResult(root, row("uncertain"));
    await enqueueAsyncResult(root, row("follower"));
    expect(await idle(root)).not.toHaveBeenCalled();
    expect(await idle(root)).not.toHaveBeenCalled();
    expect(await readFile(join(root, "async-delegate.jsonl.draining"), "utf8")).toBe(orphan);
  });

  it("delivers ordinary typed success once", async () => {
    const root = await fixture();
    await enqueueAsyncResult(root, row("ordinary"));
    const first = await idle(root);
    expect(first).toHaveBeenCalledOnce();
    expect(await idle(root)).not.toHaveBeenCalled();
  });

  it("retains an interrupted delivery and does not auto-run its follower", async () => {
    const root = await fixture();
    await enqueueAsyncResult(root, row("ordinary"));
    const run = vi.fn(async () => { throw new Error("Partial parent effect"); });
    await expect(idle(root, run)).rejects.toThrow("Partial parent effect");
    expect(run).toHaveBeenCalledOnce();
    await enqueueAsyncResult(root, row("follower"));
    expect(await idle(root)).not.toHaveBeenCalled();
    expect(await readFile(join(root, "async-delegate.jsonl"), "utf8")).toContain('"event":"claim"');
  });

  it("does not let duplicate success replace an earlier unknown outcome", async () => {
    const root = await fixture();
    await enqueueAsyncResult(root, row("same", false));
    await enqueueAsyncResult(root, row("same"));
    expect(await idle(root)).not.toHaveBeenCalled();
    expect(await readFile(join(root, "async-delegate.jsonl"), "utf8")).toContain('"effectDisposition":"unknown"');
  });
});
