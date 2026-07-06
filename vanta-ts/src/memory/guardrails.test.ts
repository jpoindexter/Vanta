import { describe, it, expect } from "vitest";
import { guardMemoryRecall, memoryGuardPromptLine } from "./guardrails.js";
import type { BrainEntry } from "../brain/entries.js";

const NOW = new Date("2026-06-15T00:00:00.000Z");

function entry(overrides: Partial<BrainEntry>): BrainEntry {
  return {
    id: overrides.id ?? "m1",
    region: overrides.region ?? "semantic",
    content: overrides.content ?? "Jason prefers short status updates.",
    entryType: overrides.entryType ?? "preference",
    createdAt: overrides.createdAt ?? "2026-06-14T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-14T00:00:00.000Z",
    accessedAt: overrides.accessedAt,
    strength: overrides.strength ?? 0.8,
    confidence: overrides.confidence ?? 0.8,
    salience: overrides.salience ?? 0.5,
    valence: overrides.valence ?? 0,
    retrievalCount: overrides.retrievalCount ?? 0,
    sourceType: overrides.sourceType ?? "self-report",
    sourceRef: overrides.sourceRef,
    contradicts: overrides.contradicts ?? [],
    relatedIds: overrides.relatedIds ?? [],
    entities: overrides.entities ?? [],
    crystalStatus: overrides.crystalStatus ?? "raw",
    forgetAfter: overrides.forgetAfter,
  };
}

describe("memory guardrails", () => {
  it("marks fresh, sourced, non-conflicting memories as usable", () => {
    const guarded = guardMemoryRecall([entry({ sourceRef: "session:1" })], { now: NOW });
    expect(guarded.usable).toHaveLength(1);
    expect(guarded.flagged).toHaveLength(0);
    expect(guarded.formatted).toContain("Memory guardrails: 1 usable, 0 flagged");
    expect(guarded.formatted).toContain("✓ use");
  });

  it("flags stale, conflicting, and weakly provenanced memories as not used", () => {
    const guarded = guardMemoryRecall([
      entry({ id: "old", updatedAt: "2026-04-01T00:00:00.000Z" }),
      entry({ id: "conflict", contradicts: ["other"], sourceRef: "session:2" }),
      entry({ id: "guess", sourceType: "inference", sourceRef: undefined }),
    ], { now: NOW });
    expect(guarded.usable).toHaveLength(0);
    expect(guarded.flagged.map((f) => f.reasons).flat()).toEqual(expect.arrayContaining(["stale", "conflicting", "weak provenance"]));
    expect(guarded.formatted).toContain("⚠ not used");
    expect(guarded.formatted).toContain("verify current state before acting");
  });

  it("injects a prompt rule that forbids acting on flagged memory alone", () => {
    expect(memoryGuardPromptLine()).toContain("freshness/conflict/provenance");
    expect(memoryGuardPromptLine()).toContain("verify current state");
  });
});
