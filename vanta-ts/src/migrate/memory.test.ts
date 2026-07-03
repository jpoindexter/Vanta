import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseAgentMemory,
  planMemoryIngest,
  ingestAgentMemory,
  MEMORY_SOURCES,
  type MemoryFact,
  type MemoryIngestDeps,
} from "./memory.js";
import { entryId, loadEntries } from "../brain/entries.js";
import { resolveBrain } from "../brain/interface.js";

const SAMPLE = `---
title: memory
tags: [x]
---
# User facts

- Jason prefers dense bullet output over prose.
- Ships ugly first, polishes after a real user.

## Notes
Uses the M4 Pro with 48GB of RAM daily.

\`\`\`bash
rm -rf /should/not/be/ingested
\`\`\`

- Jason prefers dense bullet output over prose.
short
`;

describe("parseAgentMemory", () => {
  it("lifts bullets and prose lines, dropping headings/frontmatter/code/noise/dupes", () => {
    const facts = parseAgentMemory(SAMPLE, "claude-code");
    const contents = facts.map((f) => f.content);
    expect(contents).toEqual([
      "Jason prefers dense bullet output over prose.",
      "Ships ugly first, polishes after a real user.",
      "Uses the M4 Pro with 48GB of RAM daily.",
    ]);
    // headings gone, code-fence content gone, "short" below threshold, duplicate collapsed
    expect(contents.some((c) => c.includes("rm -rf"))).toBe(false);
    expect(contents.some((c) => c === "short")).toBe(false);
  });

  it("tags every fact with the semantic region and the source provenance", () => {
    const facts = parseAgentMemory("- a durable fact worth keeping", "codex");
    expect(facts[0]).toEqual({
      content: "a durable fact worth keeping",
      region: "semantic",
      sourceRef: "codex",
    });
  });

  it("returns nothing for an empty or heading-only store", () => {
    expect(parseAgentMemory("# just a heading\n\n## another", "claude-code")).toEqual([]);
  });
});

describe("planMemoryIngest — dedup vs the brain", () => {
  const facts: MemoryFact[] = [
    { content: "fact one", region: "semantic", sourceRef: "claude-code" },
    { content: "fact two", region: "semantic", sourceRef: "claude-code" },
  ];

  it("splits new facts from ones already in the brain", () => {
    const existing = new Set([entryId("semantic", "fact one")]);
    const plan = planMemoryIngest(facts, existing, entryId);
    expect(plan.toImport.map((f) => f.content)).toEqual(["fact two"]);
    expect(plan.duplicates.map((f) => f.content)).toEqual(["fact one"]);
  });
});

describe("ingestAgentMemory — injected boundary", () => {
  it("imports only new facts, tagged external, and reports the dedup count", async () => {
    const remembered: MemoryFact[] = [];
    const deps: MemoryIngestDeps = {
      read: () => "- alpha fact here\n- beta fact here",
      existingIds: async () => new Set([entryId("semantic", "alpha fact here")]),
      remember: async (f) => { remembered.push(f); },
      idOf: entryId,
    };
    const r = await ingestAgentMemory("claude-code", deps);
    expect(r).toMatchObject({ source: "claude-code", found: true, imported: 1, deduped: 1 });
    expect(remembered.map((f) => f.content)).toEqual(["beta fact here"]);
    expect(remembered[0]?.sourceRef).toBe("claude-code");
  });

  it("returns found:false without remembering when the store is absent", async () => {
    const deps: MemoryIngestDeps = {
      read: () => null,
      existingIds: async () => new Set(),
      remember: async () => { throw new Error("should not be called"); },
      idOf: entryId,
    };
    const r = await ingestAgentMemory("codex", deps);
    expect(r).toEqual({ source: "codex", found: false, imported: 0, deduped: 0, importedFacts: [] });
  });

  it("covers both declared sources", () => {
    expect([...MEMORY_SOURCES]).toEqual(["claude-code", "codex"]);
  });
});

describe("ingestAgentMemory — real brain (recall surfaces the merged knowledge)", () => {
  let home: string;
  afterEach(() => { if (home) rmSync(home, { recursive: true, force: true }); });

  it("imports into the brain so a later recall returns the imported fact", async () => {
    home = mkdtempSync(join(tmpdir(), "vanta-xmem-"));
    const env = { ...process.env, VANTA_HOME: home } as NodeJS.ProcessEnv;
    const brain = resolveBrain(env);

    const deps: MemoryIngestDeps = {
      read: () => "- The staging deploy key rotates every Monday at 09:00 CEST.",
      existingIds: async () => new Set((await loadEntries(env)).map((e) => e.id)),
      remember: async (f) => {
        await brain.remember({ region: f.region, content: f.content, entryType: "fact", sourceType: "external", sourceRef: f.sourceRef, env });
      },
      idOf: entryId,
    };

    const r = await ingestAgentMemory("claude-code", deps);
    expect(r.imported).toBe(1);

    // Provenance persisted.
    const stored = await loadEntries(env);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.sourceType).toBe("external");
    expect(stored[0]?.sourceRef).toBe("claude-code");

    // Recall surfaces the merged knowledge.
    const hit = await brain.recall({ query: "staging deploy key rotates", env, reinforce: false });
    expect(hit.entries.some((e) => e.content.includes("rotates every Monday"))).toBe(true);

    // Re-import is a no-op dedup (same id → already-known).
    const again = await ingestAgentMemory("claude-code", deps);
    expect(again.imported).toBe(0);
    expect(again.deduped).toBe(1);
  });
});
