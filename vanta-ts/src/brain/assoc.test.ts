import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tokenize, similarity, topSimilar, autoLink, associativeRecall } from "./assoc.js";
import { loadEntries, normalizeEntry, upsertEntry } from "./entries.js";
import { remember, recall } from "./brain.js";

let home: string;
const prev = process.env.VANTA_HOME;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-assoc-"));
  process.env.VANTA_HOME = home;
});

afterEach(async () => {
  if (prev === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = prev;
  await rm(home, { recursive: true, force: true });
});

describe("tokenize + similarity (pure)", () => {
  it("keeps content words, drops stopwords and short tokens", () => {
    const t = tokenize("The kernel gates the tool and it is ok");
    expect(t.has("kernel")).toBe(true);
    expect(t.has("gates")).toBe(true);
    expect(t.has("the")).toBe(false);
    expect(t.has("it")).toBe(false);
  });

  it("scores overlap 0..1 and is symmetric", () => {
    const a = "vanta kernel gates every tool call";
    const b = "the kernel gates tool execution";
    expect(similarity(a, b)).toBeGreaterThan(0.3);
    expect(similarity(a, b)).toBeCloseTo(similarity(b, a));
    expect(similarity(a, "completely unrelated gardening topic")).toBe(0);
    expect(similarity("", a)).toBe(0);
  });

  it("topSimilar ranks best-first, honors floor and excludeId", () => {
    const entries = [
      normalizeEntry({ region: "semantic", content: "kernel gates every tool call" }),
      normalizeEntry({ region: "semantic", content: "kernel gates tool execution always" }),
      normalizeEntry({ region: "semantic", content: "gardening tips for spring" }),
    ];
    const hits = topSimilar("the kernel gates a tool", entries, { excludeId: entries[0]!.id });
    expect(hits.map((h) => h.entry.content)).toEqual(["kernel gates tool execution always"]);
  });
});

describe("autoLink (connection at write time)", () => {
  it("links similar memories both ways, ignores unrelated ones", async () => {
    const a = await upsertEntry({ region: "semantic", content: "the kernel gates every tool call" });
    await upsertEntry({ region: "semantic", content: "gardening tips for spring tulips" });
    const b = await upsertEntry({ region: "semantic", content: "kernel gates tool execution before running" });
    await autoLink(b);
    const entries = await loadEntries();
    const ea = entries.find((e) => e.id === a.id)!;
    const eb = entries.find((e) => e.id === b.id)!;
    expect(eb.relatedIds).toContain(a.id);
    expect(ea.relatedIds).toContain(b.id); // bidirectional
    const garden = entries.find((e) => e.content.includes("gardening"))!;
    expect(garden.relatedIds).toEqual([]);
  });
});

describe("associativeRecall (spreading activation)", () => {
  it("a direct hit pulls in its linked neighbor at damped activation", async () => {
    // remember() auto-links: these two share kernel/gates/tool vocabulary.
    await remember({ region: "semantic", content: "the kernel gates every tool call" });
    await remember({ region: "semantic", content: "kernel gates tool execution before running" });
    await remember({ region: "mood", content: "sunny gardening afternoon" });

    // "every call" overlaps only the first memory; the second arrives via the link.
    const acts = await associativeRecall({ query: "every call" });
    const direct = acts.find((a) => a.via === "direct");
    const assoc = acts.find((a) => a.via === "association");
    expect(direct?.entry.content).toContain("every tool call");
    expect(assoc?.entry.content).toContain("before running");
    expect(assoc!.activation).toBeLessThan(direct!.activation); // damped
    expect(acts.some((a) => a.entry.content.includes("gardening"))).toBe(false);
  });

  it("facade recall reinforces direct hits only, marks associations with ↪", async () => {
    await remember({ region: "semantic", content: "the kernel gates every tool call" });
    await remember({ region: "semantic", content: "kernel gates tool execution before running" });

    const r = await recall({ query: "every call" });
    expect(r.formatted).toContain("↪"); // association marked
    const entries = await loadEntries();
    const direct = entries.find((e) => e.content.includes("every tool call"))!;
    const neighbor = entries.find((e) => e.content.includes("before running"))!;
    expect(direct.retrievalCount).toBe(1); // retrieved → reinforced
    expect(neighbor.retrievalCount).toBe(0); // primed, not retrieved
  });
});
