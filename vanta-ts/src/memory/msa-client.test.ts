import { describe, expect, it, vi } from "vitest";
import {
  createMsaClient,
  createMsaHttpTransport,
  resolveMsaConfig,
  type MsaTransport,
} from "./msa-client.js";

describe("resolveMsaConfig", () => {
  it("requires a URL and rejects credentials embedded in it", () => {
    expect(resolveMsaConfig({}).ok).toBe(false);
    expect(resolveMsaConfig({ VANTA_MSA_URL: "https://user:pass@example.com" }).ok).toBe(false);
  });

  it("allows HTTPS and loopback HTTP but rejects insecure remote HTTP", () => {
    expect(resolveMsaConfig({ VANTA_MSA_URL: "https://msa.example.com" }).ok).toBe(true);
    expect(resolveMsaConfig({ VANTA_MSA_URL: "http://127.0.0.1:8123" }).ok).toBe(true);
    expect(resolveMsaConfig({ VANTA_MSA_URL: "http://10.0.0.4:8123" }).ok).toBe(false);
    expect(resolveMsaConfig({
      VANTA_MSA_URL: "file:///tmp/msa.sock",
      VANTA_MSA_ALLOW_INSECURE_REMOTE: "1",
    }).ok).toBe(false);
    expect(resolveMsaConfig({
      VANTA_MSA_URL: "http://10.0.0.4:8123",
      VANTA_MSA_ALLOW_INSECURE_REMOTE: "1",
    }).ok).toBe(true);
  });

  it("clamps the timeout and never returns the token in an error", () => {
    const result = resolveMsaConfig({
      VANTA_MSA_URL: "https://msa.example.com",
      VANTA_MSA_TOKEN: "top-secret",
      VANTA_MSA_TIMEOUT_MS: "999999",
    });
    expect(result.ok && result.value.timeoutMs).toBe(120_000);
    expect(JSON.stringify(resolveMsaConfig({
      VANTA_MSA_URL: "bad",
      VANTA_MSA_TOKEN: "top-secret",
    }))).not.toContain("top-secret");
  });
});

describe("MSA client", () => {
  it("parses every endpoint and returns invalid responses as values", async () => {
    const transport: MsaTransport = async (_method, path) => {
      if (path === "/v1/health") return { ready: true, status: "ok", model: "MSA-4B" };
      if (path === "/v1/memories") return { accepted: 1 };
      if (path === "/v1/query") return { results: [{ id: "d1", text: "hit", score: 0.8 }] };
      return { answer: "answer", citations: [{ id: "d1", text: "hit" }] };
    };
    const client = createMsaClient(transport);
    expect((await client.health()).ok).toBe(true);
    expect((await client.index({ documents: [{ id: "d1", text: "text" }] })).ok).toBe(true);
    expect((await client.query({ query: "q", topK: 3 })).ok).toBe(true);
    expect((await client.generate({ query: "q", topK: 3 })).ok).toBe(true);

    const invalid = createMsaClient(async () => ({ nope: true }));
    expect(await invalid.health()).toMatchObject({ ok: false, kind: "invalid_response" });
  });

  it("keeps bearer credentials inside the HTTP transport", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ready: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const transport = createMsaHttpTransport({
      baseUrl: "https://msa.example.com",
      token: "secret-token",
      timeoutMs: 1_000,
    }, fetchMock as typeof fetch);
    await transport("GET", "/v1/health");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://msa.example.com/v1/health",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer secret-token" }),
      }),
    );
  });

  it("turns an HTTP timeout into a request_failed value", async () => {
    const hangingFetch = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      }));
    const client = createMsaClient(createMsaHttpTransport({
      baseUrl: "http://127.0.0.1:8123",
      timeoutMs: 5,
    }, hangingFetch as typeof fetch));
    expect(await client.health()).toMatchObject({
      ok: false,
      kind: "request_failed",
      error: expect.stringMatching(/timed out/),
    });
  });
});
