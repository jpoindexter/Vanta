import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendRevision, listRevisions, getRevision, latestRevision } from "./config-revisions.js";

describe("config-revisions store", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "vanta-config-rev-store-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("returns [] / null when no revisions exist yet", async () => {
    expect(await listRevisions(dir)).toEqual([]);
    expect(await latestRevision(dir)).toBeNull();
    expect(await getRevision(dir, 1)).toBeNull();
  });

  it("auto-increments rev, oldest first in listRevisions", async () => {
    const r1 = await appendRevision(dir, "A=1");
    const r2 = await appendRevision(dir, "A=2");
    expect(r1.rev).toBe(1);
    expect(r2.rev).toBe(2);
    expect((await listRevisions(dir)).map((r) => r.rev)).toEqual([1, 2]);
  });

  it("latestRevision is the most recently appended one", async () => {
    await appendRevision(dir, "A=1");
    await appendRevision(dir, "A=2");
    expect((await latestRevision(dir))?.content).toBe("A=2");
  });

  it("getRevision fetches a specific rev by number", async () => {
    await appendRevision(dir, "A=1");
    await appendRevision(dir, "A=2");
    expect((await getRevision(dir, 1))?.content).toBe("A=1");
    expect(await getRevision(dir, 999)).toBeNull();
  });

  it("records an optional note", async () => {
    const r = await appendRevision(dir, "A=1", "set A");
    expect(r.note).toBe("set A");
    expect((await listRevisions(dir))[0]?.note).toBe("set A");
  });

  it("drops a corrupt line without losing the rest of the history", async () => {
    const { appendFile } = await import("node:fs/promises");
    await appendRevision(dir, "A=1");
    await appendFile(join(dir, "config-revisions.jsonl"), "not json at all\n", "utf8");
    await appendRevision(dir, "A=2");
    const all = await listRevisions(dir);
    expect(all.map((r) => r.content)).toEqual(["A=1", "A=2"]);
  });

  it("preserves full multi-line .env content byte-for-byte", async () => {
    const content = "VANTA_PROVIDER=openai\nOPENAI_API_KEY=sk-x\n# a comment\n\nVANTA_MODEL=gpt-5\n";
    await appendRevision(dir, content);
    expect((await latestRevision(dir))?.content).toBe(content);
  });
});
