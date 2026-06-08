import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { crushJson } from "./json-crush.js";
import { squashLogs } from "./log-squash.js";
import { compressText, detectContentType, binaryStub } from "./router.js";
import { ccrId, stashOriginal, retrieveOriginal } from "./store.js";
import { estTokens } from "./types.js";

describe("crushJson", () => {
  it("elides the middle of a long object array, keeping head + tail", () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: i, name: `item-${i}`, score: i * 2 }));
    const out = crushJson(JSON.stringify(rows));
    const parsed = JSON.parse(out);
    // 3 head + 1 elision marker + 1 tail = 5
    expect(parsed).toHaveLength(5);
    expect(parsed[0].id).toBe(0);
    expect(parsed[3].__elided__).toBe(96);
    expect(parsed[3].sample_keys).toEqual(["id", "name", "score"]);
    expect(parsed[4].id).toBe(99);
  });

  it("truncates runaway string values with a char count", () => {
    const obj = { log: "x".repeat(1000) };
    const out = crushJson(JSON.stringify(obj), { maxStringLength: 50 });
    expect(out).toContain("…(+950 chars)");
  });

  it("leaves a short array untouched", () => {
    const rows = [{ a: 1 }, { a: 2 }];
    const out = crushJson(JSON.stringify(rows));
    expect(JSON.parse(out)).toEqual(rows);
  });

  it("returns the raw string unchanged when not valid JSON", () => {
    expect(crushJson("not json {{{")).toBe("not json {{{");
  });
});

describe("squashLogs", () => {
  it("collapses consecutive duplicate lines", () => {
    const log = ["retrying...", "retrying...", "retrying...", "done"].join("\n");
    expect(squashLogs(log)).toBe(["retrying... (×3)", "done"].join("\n"));
  });

  it("collapses deep stack traces to the top frames", () => {
    const frames = Array.from({ length: 20 }, (_, i) => `    at fn${i} (file.js:${i})`);
    const log = ["Error: boom", ...frames].join("\n");
    const out = squashLogs(log);
    expect(out).toContain("at fn0");
    expect(out).toContain("at fn2");
    expect(out).toContain("… 17 more frames");
    expect(out).not.toContain("at fn19");
  });

  it("collapses runs of blank lines into one", () => {
    const log = ["line a", "", "", "", "line b"].join("\n");
    expect(squashLogs(log)).toBe(["line a", "", "line b"].join("\n"));
  });
});

describe("binary detection", () => {
  it("classifies a base64/binary blob as binary", () => {
    // High non-ASCII ratio (raw bytes) ⇒ binary.
    const blob = Array.from({ length: 3000 }, (_, i) => String.fromCharCode(128 + (i % 100))).join("");
    expect(detectContentType(blob)).toBe("binary");
  });

  it("elides a binary blob to a short pointer stub", () => {
    const blob = "\x80\x81\x82".repeat(5000);
    const r = compressText(blob);
    expect(r.compressed).toBe(true);
    expect(r.contentType).toBe("binary");
    expect(r.text).toBe(binaryStub(blob));
    expect(r.tokensAfter).toBeLessThan(r.tokensBefore * 0.05); // ~100% saved
  });

  it("does not misclassify normal prose as binary", () => {
    expect(detectContentType("The quick brown fox. ".repeat(200))).not.toBe("binary");
  });
});

describe("detectContentType", () => {
  it("detects json", () => expect(detectContentType('[{"a":1}]')).toBe("json"));
  it("detects logs", () => expect(detectContentType("2026-06-08 ERROR boom")).toBe("logs"));
  it("falls back to text", () => expect(detectContentType("just a sentence")).toBe("text"));
  it("treats invalid json-looking text as logs/text", () =>
    expect(detectContentType("{ broken")).not.toBe("json"));
});

describe("compressText (router)", () => {
  it("skips compression below the token floor", () => {
    const r = compressText('[{"a":1}]', { minTokens: 400 });
    expect(r.compressed).toBe(false);
    expect(r.text).toBe('[{"a":1}]');
  });

  it("compresses a large JSON payload and reports real savings", () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      id: i,
      title: `result number ${i}`,
      url: `https://example.com/page/${i}`,
      snippet: "lorem ipsum dolor sit amet ".repeat(5),
    }));
    const raw = JSON.stringify(rows, null, 2);
    const r = compressText(raw);
    expect(r.compressed).toBe(true);
    expect(r.contentType).toBe("json");
    // The advisor's rule: assert real shrink, not "didn't throw".
    expect(r.tokensAfter).toBeLessThan(r.tokensBefore);
    expect(r.tokensBefore - r.tokensAfter).toBeGreaterThan(r.tokensBefore * 0.5);
  });

  it("does not expand text it cannot compress", () => {
    const prose = "This is a paragraph of prose. ".repeat(100);
    const r = compressText(prose);
    expect(r.compressed).toBe(false);
    expect(r.text).toBe(prose);
  });
});

describe("CCR store", () => {
  let dataDir: string;
  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "vanta-ccr-"));
  });
  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("stashes and retrieves the original round-trip", async () => {
    const original = "the full uncompressed tool output";
    const id = await stashOriginal(dataDir, original);
    expect(id).toMatch(/^[a-f0-9]{10}$/);
    expect(await retrieveOriginal(dataDir, id)).toBe(original);
  });

  it("is idempotent: same content yields the same id", async () => {
    const a = await stashOriginal(dataDir, "same");
    const b = await stashOriginal(dataDir, "same");
    expect(a).toBe(b);
    expect(a).toBe(ccrId("same"));
  });

  it("returns null for an unknown id", async () => {
    expect(await retrieveOriginal(dataDir, "deadbeef00")).toBeNull();
  });

  it("rejects a non-hex id (path-traversal guard)", async () => {
    expect(await retrieveOriginal(dataDir, "../../etc/passwd")).toBeNull();
  });
});

describe("estTokens", () => {
  it("approximates 4 chars per token", () => {
    expect(estTokens("12345678")).toBe(2);
  });
});
