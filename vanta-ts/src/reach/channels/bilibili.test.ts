import { afterEach, describe, expect, it, vi } from "vitest";
import { bilibiliChannel } from "./bilibili.js";

describe("bilibili reach channel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("matches bilibili and b23 URLs", () => {
    expect(bilibiliChannel.canHandle("https://www.bilibili.com/video/BV123")).toBe(true);
    expect(bilibiliChannel.canHandle("https://b23.tv/abc")).toBe(true);
    expect(bilibiliChannel.canHandle("https://example.com/video/BV123")).toBe(false);
  });

  it("reports the public search API as a search-only fallback when local CLIs are absent", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ code: 0, data: { result: [] } }), { status: 200 }));
    const status = await bilibiliChannel.check({ PATH: "/definitely-empty" });
    expect(status).toMatchObject({
      name: "bilibili",
      status: "warn",
      activeBackend: "Bilibili search API",
    });
    expect(status.fix).toContain("bilibili-cli");
  });
});
