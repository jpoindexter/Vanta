import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseCookieInput,
  isSafeChannel,
  saveCookie,
  loadCookie,
  hasCookie,
  configuredChannels,
} from "./cookie.js";

describe("parseCookieInput", () => {
  it("passes through a k=v header", () => {
    expect(parseCookieInput("session=abc; csrf=xyz")).toBe("session=abc; csrf=xyz");
  });

  it("normalizes a Cookie-Editor JSON export to a header", () => {
    const json = JSON.stringify([
      { name: "session", value: "abc", domain: ".reddit.com" },
      { name: "csrf", value: "xyz" },
    ]);
    expect(parseCookieInput(json)).toBe("session=abc; csrf=xyz");
  });

  it("collapses newlines in a pasted header", () => {
    expect(parseCookieInput("a=1;\n b=2")).toBe("a=1; b=2");
  });

  it("returns null for junk / empty / a JSON array with no name+value", () => {
    expect(parseCookieInput("")).toBeNull();
    expect(parseCookieInput("just some words")).toBeNull();
    expect(parseCookieInput("[{\"foo\":1}]")).toBeNull();
    expect(parseCookieInput("not json [")).toBeNull();
  });
});

describe("isSafeChannel", () => {
  it("accepts slugs, rejects traversal", () => {
    expect(isSafeChannel("reddit")).toBe(true);
    expect(isSafeChannel("twitter-x")).toBe(true);
    expect(isSafeChannel("../etc")).toBe(false);
    expect(isSafeChannel("a/b")).toBe(false);
    expect(isSafeChannel("")).toBe(false);
  });
});

describe("saveCookie / loadCookie store", () => {
  let home: string;
  let prev: string | undefined;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "vanta-cookie-"));
    prev = process.env.VANTA_HOME;
    process.env.VANTA_HOME = home;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.VANTA_HOME;
    else process.env.VANTA_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  });

  it("stores 0600 and round-trips", () => {
    expect(saveCookie("reddit", "session=abc").ok).toBe(true);
    expect(loadCookie("reddit")).toBe("session=abc");
    expect(hasCookie("reddit")).toBe(true);
    const mode = statSync(join(home, "cookies", "reddit.cookie")).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("rejects an unparseable cookie + an unsafe channel name", () => {
    expect(saveCookie("reddit", "nonsense").ok).toBe(false);
    expect(saveCookie("../evil", "a=1").ok).toBe(false);
  });

  it("lists configured channels without reading values", () => {
    saveCookie("reddit", "a=1");
    saveCookie("twitter", "b=2");
    expect(configuredChannels()).toEqual(["reddit", "twitter"]);
    expect(loadCookie("missing")).toBeNull();
  });
});
