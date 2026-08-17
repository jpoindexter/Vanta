import { describe, expect, it } from "vitest";
import {
  MsaGenerateResponseSchema,
  MsaHitSchema,
  MsaIndexRequestSchema,
  MsaQueryRequestSchema,
  sanitizeMsaText,
} from "./msa-protocol.js";

describe("MSA protocol", () => {
  it("strips external control characters before text reaches a prompt", () => {
    expect(sanitizeMsaText("  safe\u0000 text\u001b[31m  ")).toBe("safe text[31m");
    expect(MsaHitSchema.parse({ id: "a\u0007", text: "hello\u0000" })).toEqual({
      id: "a",
      text: "hello",
    });
  });

  it("bounds indexing and query inputs", () => {
    expect(MsaIndexRequestSchema.parse({
      documents: [{ id: "doc-1", text: "content", metadata: { year: 2026 } }],
      namespace: "project",
    }).documents).toHaveLength(1);
    expect(MsaQueryRequestSchema.parse({ query: "where?", topK: 5 }).topK).toBe(5);
    expect(MsaQueryRequestSchema.safeParse({ query: "x", topK: 51 }).success).toBe(false);
  });

  it("rejects malformed generation responses and keeps cited hits", () => {
    const parsed = MsaGenerateResponseSchema.parse({
      answer: "grounded answer",
      citations: [{ id: "doc-1", text: "evidence", score: 0.9 }],
      latencyMs: 12,
    });
    expect(parsed.citations[0]?.id).toBe("doc-1");
    expect(MsaGenerateResponseSchema.safeParse({ answer: 7 }).success).toBe(false);
  });
});
