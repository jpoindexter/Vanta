import { describe, it, expect } from "vitest";
import { handleChatCompletion } from "./server.js";

// handleChatCompletion is tested with a fake env that will fail to resolve a provider
// (no real key). We verify it returns the right error structure without calling a live API.

describe("handleChatCompletion", () => {
  it("returns 400 for invalid JSON body", async () => {
    const { status } = await handleChatCompletion("not json", {});
    expect(status).toBe(400);
  });

  it("returns 503 when provider can't be resolved", async () => {
    const { status, body } = await handleChatCompletion(
      JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
      { VANTA_PROVIDER: "openai" }, // no OPENAI_API_KEY
    );
    expect(status).toBe(503);
    expect((body as { error: { type: string } }).error.type).toBe("provider_error");
  });

  it("returns 503 for unknown provider", async () => {
    const { status } = await handleChatCompletion(
      JSON.stringify({ messages: [] }),
      { VANTA_PROVIDER: "notarealbackend" },
    );
    expect(status).toBe(503);
  });
});

describe("startProxyServer module", () => {
  it("exports startProxyServer", async () => {
    const mod = await import("./server.js");
    expect(typeof mod.startProxyServer).toBe("function");
  });
});
