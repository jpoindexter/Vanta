import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundleUrls, refreshQueryIds } from "./twitter-heal.js";
import { loadQids } from "./twitter.js";

describe("bundleUrls", () => {
  it("extracts + dedupes client-web JS bundle URLs", () => {
    const html = `<script src="https://abs.twimg.com/responsive-web/client-web/main.abc.js"></script>
      <script src="https://abs.twimg.com/responsive-web/client-web/api.def.js"></script>
      <script src="https://abs.twimg.com/responsive-web/client-web/main.abc.js"></script>`;
    const urls = bundleUrls(html);
    expect(urls).toContain("https://abs.twimg.com/responsive-web/client-web/main.abc.js");
    expect(urls).toContain("https://abs.twimg.com/responsive-web/client-web/api.def.js");
    expect(urls).toHaveLength(2); // deduped
  });
});

describe("refreshQueryIds (mocked network)", () => {
  let home: string;
  let prev: string | undefined;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "vanta-twh-"));
    prev = process.env.VANTA_HOME;
    process.env.VANTA_HOME = home;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.VANTA_HOME;
    else process.env.VANTA_HOME = prev;
    rmSync(home, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("scrapes query ids from the homepage's bundles and caches them", async () => {
    const homepage = `<script src="https://abs.twimg.com/responsive-web/client-web/api.x.js"></script>`;
    const bundle = `e={queryId:"Q_BM",operationName:"Bookmarks"};f={queryId:"Q_ST",operationName:"SearchTimeline"}`;
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, text: async () => homepage })
      .mockResolvedValueOnce({ ok: true, text: async () => bundle });
    vi.stubGlobal("fetch", fetchSpy);

    const r = await refreshQueryIds(null, process.env);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("Bookmarks");
    expect(loadQids(process.env)).toMatchObject({ Bookmarks: "Q_BM", SearchTimeline: "Q_ST" });
  });

  it("reports clearly when x.com can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, text: async () => "" })));
    const r = await refreshQueryIds(null, process.env);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("could not reach x.com");
  });
});
