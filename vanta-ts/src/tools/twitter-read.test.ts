import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { twitterReadTool } from "./twitter-read.js";
import { saveCookie } from "../reach/cookie.js";
import type { ToolContext } from "./types.js";

const ctx = {} as ToolContext;

let home: string;
let prev: string | undefined;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "vanta-twr-"));
  prev = process.env.VANTA_HOME;
  process.env.VANTA_HOME = home;
});
afterEach(() => {
  if (prev === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = prev;
  rmSync(home, { recursive: true, force: true });
});

describe("twitter_read", () => {
  it("validates the action", async () => {
    expect((await twitterReadTool.execute({}, ctx)).ok).toBe(false);
  });

  it("returns the cookie setup step when no twitter cookie is stored", async () => {
    const r = await twitterReadTool.execute({ action: "bookmarks" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain('cookie_import channel "twitter"');
  });

  it("with a cookie but no query ids, bookmarks asks to heal (no network)", async () => {
    saveCookie("twitter", "auth_token=a; ct0=b");
    const r = await twitterReadTool.execute({ action: "bookmarks" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("reach heal twitter");
  });

  it("search needs a query (after the cookie check)", async () => {
    saveCookie("twitter", "auth_token=a; ct0=b");
    const r = await twitterReadTool.execute({ action: "search" }, ctx);
    expect(r.output).toContain("needs a query");
  });

  it("describeForSafety surfaces action + query", () => {
    expect(twitterReadTool.describeForSafety?.({ action: "bookmarks" })).toBe("twitter bookmarks");
    expect(twitterReadTool.describeForSafety?.({ action: "search", query: "ai" })).toBe("twitter search: ai");
  });
});
