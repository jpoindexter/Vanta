import { describe, expect, it, vi } from "vitest";
import { companionClient, isLocalCompanion, mobileSmokeConfig, normalizeHost, parsePairLink, streamCompanionEvents } from "./companion-client.js";

describe("native companion client", () => {
  it("does not mistake Capacitor's localhost origin for the trusted desktop host", () => {
    expect(isLocalCompanion("localhost", true, "")).toBe(false);
    expect(isLocalCompanion("localhost", false, "")).toBe(true);
    expect(isLocalCompanion("localhost", false, "?remote=1")).toBe(false);
  });

  it("accepts only a complete Vanta pairing deep link", () => {
    expect(parsePairLink("vanta://pair?host=http%3A%2F%2F127.0.0.1%3A7833&code=bcdfgh")).toEqual({ host: "http://127.0.0.1:7833", code: "BCDFGH" });
    expect(parsePairLink("https://example.com/?code=BCDFGH")).toBeNull();
    expect(parsePairLink("vanta://pair?host=http://host&code=short")).toBeNull();
  });

  it("keeps mobile smoke credentials empty unless explicitly injected at build time", () => {
    expect(mobileSmokeConfig({})).toEqual({ host: "", token: "", message: "" });
    expect(mobileSmokeConfig({ VITE_VANTA_MOBILE_SMOKE_HOST: "http://host/", VITE_VANTA_MOBILE_SMOKE_TOKEN: "t", VITE_VANTA_MOBILE_SMOKE_MESSAGE: "ping" })).toEqual({ host: "http://host", token: "t", message: "ping" });
  });
  it("normalizes the configured host and sends the pairing bearer", async () => {
    expect(normalizeHost(" http://127.0.0.1:7790/// ")).toBe("http://127.0.0.1:7790");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ kernel: "online" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await companionClient("secret", "http://host:7790/")("/status");
    expect(fetchMock).toHaveBeenCalledWith("http://host:7790/api/companion/status", expect.objectContaining({ headers: expect.any(Headers) }));
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer secret");
    vi.unstubAllGlobals();
  });

  it("parses incremental SSE events from an authenticated fetch stream", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode('data: {"label":"","delta":"Hel"}\n\ndata: {"label":"tool"}\n\n')); controller.close(); } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
    const events: unknown[] = [];
    await streamCompanionEvents({ token: "t", host: "http://host", signal: new AbortController().signal, onEvent: (event) => events.push(event) });
    expect(events).toEqual([{ label: "", delta: "Hel" }, { label: "tool" }]);
    vi.unstubAllGlobals();
  });
});
