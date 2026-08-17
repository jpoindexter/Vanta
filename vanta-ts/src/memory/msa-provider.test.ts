import { describe, expect, it, vi } from "vitest";
import { normalizeEntry } from "../brain/entry-types.js";
import type { MemoryProvider } from "./provider.js";
import type { MsaClient } from "./msa-client.js";
import type {
  MsaGenerateResponse,
  MsaHealth,
  MsaIndexReceipt,
  MsaOutcome,
  MsaQueryResponse,
} from "./msa-protocol.js";
import { makeMsaMemoryProvider, msaHitToBrainEntry } from "./msa-provider.js";

function localProvider(): MemoryProvider {
  const entry = normalizeEntry({ id: "local-1", region: "semantic", content: "local memory" });
  return {
    id: "local",
    remember: vi.fn(async (text, opts) =>
      normalizeEntry({ id: "written", region: opts?.region ?? "semantic", content: text })),
    recall: vi.fn(async () => ({ entries: [entry], formatted: "local memory", activations: [] })),
  };
}

const ok = <T>(value: T): MsaOutcome<T> => ({ ok: true, value });

function client(overrides: Partial<MsaClient> = {}): MsaClient {
  return {
    health: vi.fn(async () => ok<MsaHealth>({ ready: true, status: "ok" })),
    index: vi.fn(async () => ok<MsaIndexReceipt>({ accepted: 1, rejected: 0 })),
    query: vi.fn(async () => ok<MsaQueryResponse>({
      results: [{ id: "remote-1", text: "remote memory", score: 0.9 }],
    })),
    generate: vi.fn(async () => ok<MsaGenerateResponse>({ answer: "answer", citations: [] })),
    ...overrides,
  };
}

describe("MSA memory provider", () => {
  it("writes locally first and indexes the resulting durable entry", async () => {
    const local = localProvider();
    const remote = client();
    const provider = makeMsaMemoryProvider(local, remote);
    const entry = await provider.remember("new fact", { region: "episodic" });
    expect(entry.region).toBe("episodic");
    expect(local.remember).toHaveBeenCalled();
    expect(remote.index).toHaveBeenCalledWith(expect.objectContaining({
      namespace: "episodic",
      documents: [expect.objectContaining({ id: "written", text: "new fact" })],
    }));
  });

  it("returns sanitized MSA hits and falls back to local on service failure", async () => {
    const local = localProvider();
    const provider = makeMsaMemoryProvider(local, client());
    const remote = await provider.recall("question", { topK: 2 });
    expect(remote.entries[0]?.sourceRef).toBe("msa:remote-1");
    expect(remote.formatted).toContain("remote memory");

    const failed = makeMsaMemoryProvider(local, client({
      query: vi.fn(async () => ({
        ok: false as const,
        kind: "request_failed" as const,
        error: "offline",
      })),
    }));
    expect((await failed.recall("question")).formatted).toBe("local memory");

    const empty = makeMsaMemoryProvider(local, client({
      query: vi.fn(async () => ok<MsaQueryResponse>({ results: [] })),
    }));
    expect((await empty.recall("question")).formatted).toBe("local memory");
  });

  it("maps negative cosine scores into bounded confidence", () => {
    expect(msaHitToBrainEntry({ id: "x", text: "x", score: -0.5 }).confidence).toBe(0.25);
  });
});
