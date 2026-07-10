import { describe, expect, it, vi } from "vitest";
import {
  bvId,
  formatSearchApi,
  readBilibiliSubtitles,
  readBilibiliVideo,
  searchBilibili,
} from "./bilibili.js";
import type { BilibiliRunner } from "./bilibili.js";

const apiJson = {
  code: 0,
  data: {
    result: [
      {
        result_type: "video",
        data: [
          {
            title: "<em class=\"keyword\">AI</em> agent",
            author: "up",
            bvid: "BV123",
            arcurl: "https://www.bilibili.com/video/BV123",
          },
        ],
      },
    ],
  },
};

describe("bilibili reach helpers", () => {
  it("extracts BV ids from raw ids and URLs", () => {
    expect(bvId("BV1d4411N7zD")).toBe("BV1d4411N7zD");
    expect(bvId("https://www.bilibili.com/video/BV1d4411N7zD/?spm=1")).toBe("BV1d4411N7zD");
  });

  it("formats public search API results", () => {
    expect(formatSearchApi(apiJson)).toContain("AI agent");
    expect(formatSearchApi(apiJson)).toContain("BV123");
  });

  it("searches through bili-cli first", async () => {
    const calls: string[] = [];
    const runner: BilibiliRunner = async (cmd, args) => {
      calls.push([cmd, ...args].join(" "));
      return { stdout: "result", stderr: "" };
    };
    const r = await searchBilibili("AI", 3, { run: runner });
    expect(r).toMatchObject({ ok: true, backend: "bili-cli", output: "result" });
    expect(calls[0]).toBe("bili search AI --type video -n 3");
  });

  it("falls back to the search API when bili-cli is missing", async () => {
    const runner: BilibiliRunner = async () => {
      const err = new Error("ENOENT") as Error & { code: string };
      err.code = "ENOENT";
      throw err;
    };
    const fetcher = vi.fn(async () => new Response(JSON.stringify(apiJson), { status: 200 }));
    const r = await searchBilibili("AI", 1, { run: runner, fetch: fetcher });
    expect(r).toMatchObject({ ok: true, backend: "bilibili-search-api" });
    expect(r.ok ? r.output : "").toContain("AI agent");
  });

  it("reads video detail through bili video", async () => {
    const runner = vi.fn(async () => ({ stdout: "detail", stderr: "" }));
    await expect(readBilibiliVideo("https://www.bilibili.com/video/BV123", { run: runner })).resolves.toMatchObject({
      ok: true,
      backend: "bili-cli",
    });
    expect(runner).toHaveBeenCalledWith("bili", ["video", "BV123"]);
  });

  it("reads subtitles through OpenCLI", async () => {
    const runner = vi.fn(async () => ({ stdout: "subtitle", stderr: "" }));
    await expect(readBilibiliSubtitles("BV123", { run: runner })).resolves.toMatchObject({
      ok: true,
      backend: "opencli",
    });
    expect(runner).toHaveBeenCalledWith("opencli", ["bilibili", "subtitle", "BV123"]);
  });
});
