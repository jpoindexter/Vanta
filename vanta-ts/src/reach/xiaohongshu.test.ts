import { describe, expect, it } from "vitest";
import {
  readXiaohongshuComments,
  readXiaohongshuFeed,
  readXiaohongshuNote,
  searchXiaohongshu,
  xiaohongshuNoteId,
} from "./xiaohongshu.js";
import type { XiaohongshuRunner } from "./xiaohongshu.js";

function runner(calls: Array<{ cmd: string; args: string[] }>): XiaohongshuRunner {
  return async (cmd, args) => {
    calls.push({ cmd, args });
    return { stdout: "ok", stderr: "" };
  };
}

describe("xiaohongshu reach helpers", () => {
  it("builds confirmed OpenCLI commands", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    await searchXiaohongshu("coffee", { run: runner(calls) });
    await readXiaohongshuNote("https://www.xiaohongshu.com/explore/abc", { run: runner(calls) });
    await readXiaohongshuComments("https://www.xiaohongshu.com/explore/abc?xsec_token=t", { run: runner(calls) });
    await readXiaohongshuFeed({ run: runner(calls) });
    expect(calls).toEqual([
      { cmd: "opencli", args: ["xiaohongshu", "search", "coffee", "-f", "yaml"] },
      { cmd: "opencli", args: ["xiaohongshu", "note", "https://www.xiaohongshu.com/explore/abc", "-f", "yaml"] },
      { cmd: "opencli", args: ["xiaohongshu", "comments", "abc", "-f", "yaml"] },
      { cmd: "opencli", args: ["xiaohongshu", "feed", "-f", "yaml"] },
    ]);
  });

  it("extracts note ids from common note URLs", () => {
    expect(xiaohongshuNoteId("https://www.xiaohongshu.com/explore/abc?xsec_token=t")).toBe("abc");
    expect(xiaohongshuNoteId("https://www.xiaohongshu.com/discovery/item/def")).toBe("def");
    expect(xiaohongshuNoteId("raw-id")).toBe("raw-id");
  });

  it("returns setup guidance when OpenCLI is missing", async () => {
    const r = await searchXiaohongshu("coffee", {
      run: async () => {
        const err = new Error("spawn opencli ENOENT") as Error & { code: string };
        err.code = "ENOENT";
        throw err;
      },
    });
    expect(r).toMatchObject({ ok: false, error: "OpenCLI missing" });
    if (!r.ok) expect(r.fix).toContain("OpenCLI");
  });
});
