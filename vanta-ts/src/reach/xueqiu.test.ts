import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveCookie } from "./cookie.js";
import { xueqiuHotPosts, xueqiuHotStocks, xueqiuQuote, xueqiuSearch } from "./xueqiu.js";

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "vanta-xueqiu-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function fetcher(json: unknown) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    expect((init?.headers as Record<string, string>).cookie).toContain("xq_a_token=abc");
    return new Response(JSON.stringify(json), { status: 200 });
  });
}

describe("xueqiu reach helpers", () => {
  it("requires a stored cookie before calling Xueqiu", async () => {
    const r = await xueqiuQuote("SH000001", { env: { VANTA_HOME: home }, fetch: fetcher({}) });
    expect(r).toMatchObject({ ok: false, error: "no xueqiu cookie" });
  });

  it("formats a stock quote", async () => {
    saveCookie("xueqiu", "xq_a_token=abc", { VANTA_HOME: home });
    const r = await xueqiuQuote("SH000001", {
      env: { VANTA_HOME: home },
      fetch: fetcher({ data: { items: [{ quote: { symbol: "SH000001", name: "上证指数", current: 3000, percent: 1.2 } }] } }),
    });
    expect(r.ok ? r.output : "").toContain("上证指数 SH000001");
  });

  it("formats stock search results", async () => {
    saveCookie("xueqiu", "xq_a_token=abc", { VANTA_HOME: home });
    const r = await xueqiuSearch("茅台", 1, {
      env: { VANTA_HOME: home },
      fetch: fetcher({ stocks: [{ code: "SH600519", name: "贵州茅台", exchange: "SH" }] }),
    });
    expect(r.ok ? r.output : "").toContain("贵州茅台");
  });

  it("formats hot posts and hot stocks", async () => {
    saveCookie("xueqiu", "xq_a_token=abc", { VANTA_HOME: home });
    const post = { title: "Market note", user: { screen_name: "analyst" }, target: "/123" };
    const posts = await xueqiuHotPosts(1, { env: { VANTA_HOME: home }, fetch: fetcher({ list: [{ data: JSON.stringify(post) }] }) });
    expect(posts.ok ? posts.output : "").toContain("Market note");
    const stocks = await xueqiuHotStocks(1, 10, {
      env: { VANTA_HOME: home },
      fetch: fetcher({ data: { items: [{ code: "SH600519", name: "贵州茅台", current: 100, percent: 2 }] } }),
    });
    expect(stocks.ok ? stocks.output : "").toContain("SH600519");
  });
});
