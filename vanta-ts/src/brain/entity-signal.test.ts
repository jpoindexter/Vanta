import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeEntry } from "./entry-types.js";
import { upsertEntry, loadEntries } from "./entries.js";
import { associativeRecall } from "./assoc.js";

// BRAIN-ENTITY-SIGNAL — entities are extracted at write, stored on the entry,
// linked across memories, and scored as a third recall signal.

let prev: string | undefined;

beforeEach(async () => {
  prev = process.env.VANTA_HOME;
  process.env.VANTA_HOME = await mkdtemp(join(tmpdir(), "vanta-brain-ent-"));
});

afterEach(() => {
  if (prev === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = prev;
});

describe("entity storage", () => {
  it("normalizeEntry extracts and stores entities from content", () => {
    const e = normalizeEntry({ region: "people", content: "Caroline moved to Zurich" });
    expect(e.entities).toContain("caroline");
    expect(e.entities).toContain("zurich");
  });

  it("a legacy entry without an entities field backfills on normalize (load path)", () => {
    const e = normalizeEntry({ region: "people", content: "met Melanie at the gallery" });
    expect(e.entities).toEqual(["melanie"]);
  });

  it("upsertEntry persists entities; loadEntries returns them", async () => {
    await upsertEntry({ region: "people", content: "Caroline adopted a retriever" });
    const [entry] = await loadEntries();
    expect(entry?.entities).toContain("caroline");
  });
});

describe("entity-match recall signal", () => {
  it("surfaces a memory whose only tie to the query is a rare entity (below the similarity floor)", async () => {
    // 1 shared token among many → Jaccard ≈ 0.1 < DIRECT_MIN_REL 0.18; the
    // rare-entity boost (+0.25) is what makes it recallable.
    await upsertEntry({
      region: "people",
      content: "Zurich marathon finished strong despite heavy rain wind cold cobblestones crowds",
    });
    const hits = await associativeRecall({ query: "Zurich?" });
    expect(hits.map((h) => h.entry.content)).toEqual([
      "Zurich marathon finished strong despite heavy rain wind cold cobblestones crowds",
    ]);
  });

  it("ranks the entry sharing a rare query entity above an equally-similar one", async () => {
    await upsertEntry({ region: "notes", content: "the meeting notes cover project deadlines and budget review" });
    await upsertEntry({ region: "notes", content: "the meeting notes cover Okafor deadlines and budget review" });
    const hits = await associativeRecall({ query: "what did Okafor say about the meeting notes budget" });
    expect(hits[0]?.entry.content).toContain("Okafor");
  });
});
