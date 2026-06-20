import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  storeExemplar,
  recallExemplars,
  exemplarContext,
  formatExemplars,
  isExemplar,
  parseExemplar,
} from "./exemplars.js";
import { storeExemplar as facadeStore, recallExemplars as facadeRecall } from "./brain.js";
import { loadEntries } from "./entries.js";

let home: string;
const prev = process.env.VANTA_HOME;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-exemplars-"));
  process.env.VANTA_HOME = home;
});

afterEach(async () => {
  if (prev === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = prev;
  await rm(home, { recursive: true, force: true });
});

describe("composeContent + parseExemplar (pure round-trip)", () => {
  it("parses a stored exemplar back into its task and winning output", () => {
    const { task, win } = parseExemplar("[exemplar] task: write a zod schema\nwin: z.object({ id: z.string() })");
    expect(task).toBe("write a zod schema");
    expect(win).toBe("z.object({ id: z.string() })");
  });

  it("survives a missing win marker without throwing", () => {
    const { task, win } = parseExemplar("[exemplar] task: lonely task");
    expect(task).toBe("lonely task");
    expect(win).toBe("");
  });
});

describe("storeExemplar (winner becomes a crystallized brain entry)", () => {
  it("stores the win as a crystallized, exemplar-tagged entry", async () => {
    const res = await storeExemplar("write a parameterized SQL query", "SELECT * FROM t WHERE id = $1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.entry.sourceType).toBe("crystallized");
    expect(res.entry.crystalStatus).toBe("crystallized");
    expect(isExemplar(res.entry)).toBe(true);

    const [stored] = await loadEntries();
    expect(stored?.content).toContain("write a parameterized SQL query");
    expect(stored?.content).toContain("SELECT * FROM t WHERE id = $1");
  });

  it("rejects empty task or empty winning output as a value, not a throw", async () => {
    expect((await storeExemplar("", "win")).ok).toBe(false);
    expect((await storeExemplar("task", "  ")).ok).toBe(false);
  });

  it("re-storing the same task+win strengthens it (brain upsert)", async () => {
    await storeExemplar("dedup a list", "Array.from(new Set(xs))");
    const before = (await loadEntries())[0]!.strength;
    await storeExemplar("dedup a list", "Array.from(new Set(xs))");
    const after = (await loadEntries())[0]!.strength;
    expect(after).toBeGreaterThan(before); // re-assertion strengthens
    expect(await loadEntries()).toHaveLength(1); // no duplicate
  });
});

describe("recallExemplars (a later similar task retrieves winners as few-shot)", () => {
  it("retrieves the most similar exemplar for a similar task", async () => {
    await storeExemplar("parse a json config file safely", "JSON.parse with a zod schema guard");
    await storeExemplar("plant tomatoes in spring", "dig a hole and water daily");

    const hits = await recallExemplars("safely parse a json config", 3);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]?.task).toContain("parse a json config");
    expect(hits[0]?.win).toContain("zod schema guard");
    // the unrelated gardening exemplar should not be the top hit
    expect(hits[0]?.task).not.toContain("tomatoes");
  });

  it("honors k and returns empty for an empty query", async () => {
    await storeExemplar("task a about kernels gates tools", "win a");
    await storeExemplar("task b about kernels gates tools", "win b");
    await storeExemplar("task c about kernels gates tools", "win c");
    expect(await recallExemplars("kernels gates tools", 2)).toHaveLength(2);
    expect(await recallExemplars("   ", 3)).toEqual([]);
    expect(await recallExemplars("anything", 0)).toEqual([]);
  });

  it("recall reinforcement strengthens a used exemplar", async () => {
    await storeExemplar("validate an email address with regex", "/^[^@]+@[^@]+$/");
    const before = (await loadEntries())[0]!;
    expect(before.retrievalCount).toBe(0);

    await recallExemplars("validate an email address", 3);

    const after = (await loadEntries())[0]!;
    expect(after.retrievalCount).toBe(1); // recall reinforced the winner
    expect(after.strength).toBeGreaterThan(before.strength);
  });

  it("ignores ordinary semantic facts, returning only tagged exemplars", async () => {
    const { remember } = await import("./brain.js");
    await remember({ region: "semantic", content: "ordinary fact about parsing json files" });
    await storeExemplar("parse json files robustly", "use a streaming parser");

    const hits = await recallExemplars("parse json files", 5);
    expect(hits.length).toBe(1);
    expect(hits.every((h) => isExemplar(h.entry))).toBe(true);
  });
});

describe("formatExemplars + exemplarContext (few-shot rendering)", () => {
  it("renders recalled winners as a labeled few-shot block", async () => {
    await storeExemplar("write a retry wrapper", "wrap fn in a backoff loop");
    const ctx = await exemplarContext("write a retry wrapper", 3);
    expect(ctx).toContain("Best-of exemplars");
    expect(ctx).toContain("write a retry wrapper");
    expect(ctx).toContain("wrap fn in a backoff loop");
  });

  it("formats to empty string when nothing matches", () => {
    expect(formatExemplars([])).toBe("");
  });

  it("exemplarContext is empty when no exemplar is similar", async () => {
    await storeExemplar("totally unrelated knitting pattern", "purl two together");
    expect(await exemplarContext("compile a rust binary")).toBe("");
  });
});

describe("facade exposure", () => {
  it("storeExemplar + recallExemplars are reachable from brain.ts", async () => {
    const res = await facadeStore("compose a workflow graph", "FABRO declarative node list");
    expect(res.ok).toBe(true);
    const hits = await facadeRecall("compose a workflow graph", 3);
    expect(hits[0]?.win).toContain("FABRO declarative node list");
  });
});
