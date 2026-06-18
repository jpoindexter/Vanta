import { describe, it, expect } from "vitest";
import { classifyIngest, toLivePointer, isLivePointer, LIVE_POINTER_PREFIX } from "./ingest-gate.js";
import { resolveRetriever, type RankCtx } from "../mem-eval/retrievers.js";
import { recallAtK } from "../mem-eval/grade.js";
import type { MemoryRecord } from "../mem-eval/types.js";

const NOW = Date.parse("2024-07-01");
const ctx: RankCtx = { now: NOW, queryVec: null, recordVecs: new Map() };

describe("classifyIngest", () => {
  it("flags time-sensitive facts as volatile", () => {
    expect(classifyIngest("The Acme deal status is now negotiating")).toBe("volatile");
    expect(classifyIngest("I have 4 unread emails in my inbox")).toBe("volatile");
    expect(classifyIngest("The account balance is currently low")).toBe("volatile");
    expect(classifyIngest("The subscription price is $20/month")).toBe("volatile");
  });

  it("treats durable facts as evergreen", () => {
    expect(classifyIngest("Jason's primary editor is Zed")).toBe("evergreen");
    expect(classifyIngest("Vanta's kernel is written in Rust")).toBe("evergreen");
    expect(classifyIngest("Jason prefers numbered lists over pickers")).toBe("evergreen");
  });
});

describe("toLivePointer", () => {
  it("names the source and subject but never copies the volatile value", () => {
    const ptr = toLivePointer("The Acme deal status in Slack is now negotiating");
    expect(ptr.source).toBe("Slack");
    expect(ptr.text.startsWith(LIVE_POINTER_PREFIX)).toBe(true);
    expect(ptr.text.toLowerCase()).not.toContain("negotiating"); // value dropped
    expect(ptr.text.toLowerCase()).toContain("acme deal status");
    expect(isLivePointer(ptr.text)).toBe(true);
  });

  it("falls back to a generic source when none is named", () => {
    expect(toLivePointer("The balance is currently low").source).toBe("the source system");
  });
});

// Validation against the eval grader: gating volatile facts lowers the stale-hit rate.
describe("ingest gate reduces stale/noise retrieval (eval-grader check)", () => {
  const volatile = [
    { id: "v1", q: "Acme deal status", text: "The Acme deal status is now negotiating", value: "negotiating" },
    { id: "v2", q: "unread email count", text: "There are 7 unread emails in my inbox", value: "7" },
  ];
  const evergreen: MemoryRecord[] = [
    { id: "e1", session: 1, at: "2024-01-01", text: "Jason's primary editor is Zed" },
    { id: "e2", session: 1, at: "2024-01-02", text: "Vanta gates every tool call through the kernel" },
  ];

  function staleHits(buildVolatileText: (v: (typeof volatile)[number]) => string): number {
    let hits = 0;
    for (const v of volatile) {
      const records: MemoryRecord[] = [
        ...evergreen,
        { id: v.id, session: 2, at: "2024-06-01", text: buildVolatileText(v) },
      ];
      const ranked = resolveRetriever("lexical").rank(v.q, records, ctx);
      // a "stale hit" = the record retrieved in top-3 still carries the volatile value
      const top = new Set(ranked.slice(0, 3));
      const rec = records.find((r) => r.id === v.id);
      if (top.has(v.id) && rec && rec.text.includes(v.value)) hits++;
    }
    return hits;
  }

  it("baseline (verbatim copies) surfaces stale values; gated pointers do not", () => {
    const baseline = staleHits((v) => v.text); // copy the value
    const gated = staleHits((v) => toLivePointer(v.text).text); // pointer, value dropped
    expect(baseline).toBeGreaterThan(0);
    expect(gated).toBe(0);
    expect(gated).toBeLessThan(baseline);
  });

  it("the live pointer is still retrievable for its subject", () => {
    const v = volatile[0]!;
    const records: MemoryRecord[] = [...evergreen, { id: v.id, session: 2, at: "2024-06-01", text: toLivePointer(v.text).text }];
    const ranked = resolveRetriever("lexical").rank(v.q, records, ctx);
    expect(recallAtK(ranked, [v.id], 3)).toBe(1);
  });
});
