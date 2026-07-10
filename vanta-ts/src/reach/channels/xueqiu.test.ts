import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveCookie } from "../cookie.js";
import { xueqiuChannel } from "./xueqiu.js";

describe("xueqiu reach channel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("matches xueqiu URLs", () => {
    expect(xueqiuChannel.canHandle("https://xueqiu.com/S/SH600519")).toBe(true);
    expect(xueqiuChannel.canHandle("https://example.com/S/SH600519")).toBe(false);
  });

  it("reports setup guidance when no cookie is configured", async () => {
    const home = mkdtempSync(join(tmpdir(), "vanta-xueqiu-channel-"));
    try {
      const status = await xueqiuChannel.check({ VANTA_HOME: home });
      expect(status).toMatchObject({ status: "off", activeBackend: null });
      expect(status.fix).toContain("cookie_import");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("probes the quote endpoint when a cookie is configured", async () => {
    const home = mkdtempSync(join(tmpdir(), "vanta-xueqiu-channel-"));
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({
      data: { items: [{ quote: { symbol: "SH000001", name: "上证指数", current: 3000 } }] },
    }), { status: 200 }));
    try {
      saveCookie("xueqiu", "xq_a_token=abc", { VANTA_HOME: home });
      const status = await xueqiuChannel.check({ VANTA_HOME: home });
      expect(status).toMatchObject({ status: "ok", activeBackend: "Xueqiu API (cookie)" });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
