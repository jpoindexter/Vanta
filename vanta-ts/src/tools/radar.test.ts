import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { radarTool } from "./radar.js";
import { saveCookie } from "../reach/cookie.js";
import type { ToolContext } from "./types.js";

const ctx = {} as unknown as ToolContext;

describe("radarTool", () => {
  let home: string;
  let prev: string | undefined;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-rt-"));
    prev = process.env.VANTA_HOME;
    process.env.VANTA_HOME = home;
  });
  afterEach(async () => {
    if (prev === undefined) delete process.env.VANTA_HOME; else process.env.VANTA_HOME = prev;
    await rm(home, { recursive: true, force: true });
  });

  it("records an opportunity then retrieves it via list", async () => {
    const rec = await radarTool.execute({ action: "record", id: "saas-pain", title: "SaaS Pain Point" }, ctx);
    expect(rec.ok).toBe(true);
    const list = await radarTool.execute({ action: "list" }, ctx);
    expect(list.output).toContain("saas-pain");
  });

  it("scores an opportunity and list ranks highest first", async () => {
    await radarTool.execute({ action: "record", id: "low", title: "Low Signal" }, ctx);
    await radarTool.execute({ action: "record", id: "high", title: "High Signal" }, ctx);
    await radarTool.execute({ action: "score", id: "low", pain: 0.1, buyer: 0.1 }, ctx);
    await radarTool.execute({ action: "score", id: "high", pain: 0.9, buyer: 0.8 }, ctx);
    const list = await radarTool.execute({ action: "list" }, ctx);
    const lines = (list.output ?? "").split("\n");
    const highIdx = lines.findIndex((l) => l.includes("high"));
    const lowIdx = lines.findIndex((l) => l.includes("low"));
    expect(highIdx).toBeLessThan(lowIdx);
  });

  it("validates required fields for record (needs id)", async () => {
    const r = await radarTool.execute({ action: "record", title: "No id" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("id");
  });

  it("validates required fields for record (needs title)", async () => {
    const r = await radarTool.execute({ action: "record", id: "x" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("title");
  });

  it("score rejects unknown id", async () => {
    const r = await radarTool.execute({ action: "score", id: "ghost", pain: 0.5, buyer: 0.5 }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("not found");
  });

  it("list on empty store prompts to record", async () => {
    const r = await radarTool.execute({ action: "list" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("record");
  });

  it("describeForSafety returns radar + action", () => {
    expect(radarTool.describeForSafety?.({ action: "record" })).toBe("radar record");
    expect(radarTool.describeForSafety?.({ action: "list" })).toBe("radar list");
  });

  it("scan_web from:reddit asks for a cookie when none is configured", async () => {
    const r = await radarTool.execute({ action: "scan_web", from: "reddit", query: "pain" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("no reddit cookie");
  });

  it("scan_web from:reddit pulls posts → scored opportunities (mocked fetch)", async () => {
    saveCookie("reddit", "session=abc");
    const listing = { data: { children: [
      { kind: "t3", data: { title: "Our team wastes budget on a broken manual tool", subreddit: "startups", score: 40, num_comments: 9, permalink: "/r/startups/abc", selftext: "expensive and slow" } },
    ] } };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => listing })));
    try {
      const r = await radarTool.execute({ action: "scan_web", from: "reddit", query: "budget", subreddit: "startups" }, ctx);
      expect(r.ok).toBe(true);
      expect(r.output).toContain("reddit:");
      expect(r.output).toContain("added 1 candidate");
      const list = await radarTool.execute({ action: "list" }, ctx);
      expect(list.output).toContain("reddit-"); // reddit-sourced id prefix
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("scan_web from:twitter degrades gracefully without a twitter cookie", async () => {
    // temp VANTA_HOME (from beforeEach) → no twitter cookie → graceful skip
    const r = await radarTool.execute({ action: "scan_web", from: "twitter", query: "manual work" }, ctx);
    expect(r.ok).toBe(true); // never throws
    expect(r.output).toContain("twitter unavailable");
  });

  it("scan_web from:rss reads a feed → opportunities (mocked fetch)", async () => {
    const xml = `<rss><channel><title>Indie</title><item><title>Painful manual deploys waste time</title><link>https://b/1</link><description>teams struggle</description></item></channel></rss>`;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, text: async () => xml })));
    try {
      const r = await radarTool.execute({ action: "scan_web", from: "rss", feed: "https://b/feed.xml" }, ctx);
      expect(r.ok).toBe(true);
      expect(r.output).toContain("rss:");
      expect(r.output).toContain("added 1 candidate");
    } finally {
      vi.restoreAllMocks();
    }
  });
});
