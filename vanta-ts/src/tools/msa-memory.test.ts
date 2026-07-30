import { describe, expect, it, vi } from "vitest";
import type { MsaClient } from "../memory/msa-client.js";
import type {
  MsaGenerateResponse,
  MsaHealth,
  MsaIndexReceipt,
  MsaOutcome,
  MsaQueryResponse,
} from "../memory/msa-protocol.js";
import { executeMsaMemory, msaMemoryTool } from "./msa-memory.js";

const ok = <T>(value: T): MsaOutcome<T> => ({ ok: true, value });

function client(): MsaClient {
  return {
    health: vi.fn(async () => ok<MsaHealth>({
      ready: true,
      status: "ok",
      model: "MSA-4B",
    })),
    index: vi.fn(async (input: Parameters<MsaClient["index"]>[0]) => ok<MsaIndexReceipt>({
      accepted: input.documents.length,
      rejected: 0,
      indexedIds: input.documents.map((document) => document.id),
    })),
    query: vi.fn(async () => ok<MsaQueryResponse>({
      results: [{ id: "d1", text: "evidence", score: 0.8 }],
    })),
    generate: vi.fn(async () => ok<MsaGenerateResponse>({
      answer: "grounded answer",
      citations: [{ id: "d1", text: "evidence" }],
    })),
  };
}

describe("msa_memory tool", () => {
  it("supports status, index, query, and generate through one bounded contract", async () => {
    const runtime = client();
    expect((await executeMsaMemory({ action: "status" }, runtime)).output).toContain("MSA-4B");
    expect((await executeMsaMemory({ action: "index", content: "document" }, runtime)).output).toContain('"accepted": 1');
    expect((await executeMsaMemory({ action: "query", query: "q" }, runtime)).output).toContain("evidence");
    expect((await executeMsaMemory({ action: "generate", query: "q" }, runtime)).output).toContain("grounded answer");
  });

  it("refuses missing inputs and oversized documents before transport", async () => {
    const runtime = client();
    expect((await executeMsaMemory({ action: "query" }, runtime)).ok).toBe(false);
    const oversized = "x".repeat(10 * 1024 * 1024 + 1);
    expect((await executeMsaMemory({ action: "index", content: oversized }, runtime)).output).toMatch(/10 MB/);
    expect(runtime.index).not.toHaveBeenCalled();
  });

  it("does not echo indexed content into the safety description", () => {
    expect(msaMemoryTool.describeForSafety?.({
      action: "index",
      content: "private document",
    })).toBe("send content to the configured MSA memory runtime for indexing");
  });
});
