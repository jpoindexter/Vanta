import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pruneStaleBlocks, getMemoryFootprint, formatForgetSummary, DEFAULT_TTL_DAYS } from "./forget.js";

const OLD_DATE = new Date("2020-01-01T00:00:00Z").toISOString();
const RECENT_DATE = new Date().toISOString();

function makeBlock(ts: string, content: string): string {
  return `## ${ts}\n${content}`;
}

let home: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-forget-"));
  await mkdir(join(home, "memories"), { recursive: true });
  env = { VANTA_HOME: home };
});

afterEach(async () => {
  await rm(home, { recursive: true }).catch(() => {});
});

describe("pruneStaleBlocks", () => {
  it("returns zeros when no file exists", async () => {
    const r = await pruneStaleBlocks("goal-1", env);
    expect(r.totalBefore).toBe(0);
    expect(r.pruned).toBe(0);
  });

  it("prunes old non-durable blocks", async () => {
    const content = [
      makeBlock(OLD_DATE, "ok yes sure thanks"),
      makeBlock(OLD_DATE, "sounds good"),
    ].join("\n\n") + "\n\n";
    await writeFile(join(home, "memories", "goal-1.md"), content);
    const r = await pruneStaleBlocks("goal-1", env, { ttlDays: 1, now: new Date() });
    expect(r.pruned).toBe(2);
    expect(r.totalAfter).toBe(0);
  });

  it("keeps durable blocks even if old", async () => {
    const durableContent = makeBlock(OLD_DATE, "I prefer ESM modules always, never CommonJS");
    const noiseContent = makeBlock(OLD_DATE, "ok thanks got it");
    const content = [durableContent, noiseContent].join("\n\n") + "\n\n";
    await writeFile(join(home, "memories", "goal-1.md"), content);
    const r = await pruneStaleBlocks("goal-1", env, { ttlDays: 1, now: new Date() });
    expect(r.pruned).toBe(1);
    expect(r.kept).toBe(1);
  });

  it("keeps recent blocks even if non-durable", async () => {
    const content = makeBlock(RECENT_DATE, "ok thanks") + "\n\n";
    await writeFile(join(home, "memories", "goal-1.md"), content);
    const r = await pruneStaleBlocks("goal-1", env, { ttlDays: DEFAULT_TTL_DAYS, now: new Date() });
    expect(r.pruned).toBe(0);
    expect(r.kept).toBe(1);
  });
});

describe("getMemoryFootprint", () => {
  it("returns zeros when no memories dir", async () => {
    const emptyHome = await mkdtemp(join(tmpdir(), "vanta-forget-empty-"));
    try {
      const f = await getMemoryFootprint({ VANTA_HOME: emptyHome });
      expect(f.goals).toBe(0);
      expect(f.totalBytes).toBe(0);
    } finally {
      await rm(emptyHome, { recursive: true }).catch(() => {});
    }
  });

  it("measures files when memories exist", async () => {
    await writeFile(join(home, "memories", "goal-1.md"), "## 2024-01-01\ncontent\n\n");
    const f = await getMemoryFootprint(env);
    expect(f.goals).toBe(1);
    expect(f.totalBytes).toBeGreaterThan(0);
    expect(f.files[0]?.goalId).toBe("goal-1");
  });
});

describe("formatForgetSummary", () => {
  it("formats a summary with pruned blocks", () => {
    const results = [{ goalId: "1", totalBefore: 10, totalAfter: 8, pruned: 2, kept: 8 }];
    const before = { goals: 1, totalBytes: 1000, files: [] };
    const after = { goals: 1, totalBytes: 900, files: [] };
    const s = formatForgetSummary(results, before, after);
    expect(s).toContain("pruned 2");
    expect(s).toContain("1000B → 900B");
  });
});
