import { describe, it, expect, vi } from "vitest";
import {
  classifyExtractTier,
  splitIntoChunks,
  refusalGuidance,
  runExtractPipeline,
  DEFAULT_EXTRACT_THRESHOLDS,
  type ExtractThresholds,
} from "./extract-pipeline.js";

describe("classifyExtractTier", () => {
  const t: ExtractThresholds = { asIsMax: 10, summarizeMax: 100, chunkMax: 1000 };

  it("classifies each boundary correctly (inclusive upper bound)", () => {
    expect(classifyExtractTier(10, t)).toBe("as-is");
    expect(classifyExtractTier(11, t)).toBe("summarize");
    expect(classifyExtractTier(100, t)).toBe("summarize");
    expect(classifyExtractTier(101, t)).toBe("chunk-synthesize");
    expect(classifyExtractTier(1000, t)).toBe("chunk-synthesize");
    expect(classifyExtractTier(1001, t)).toBe("refuse");
  });

  it("uses the documented Hermes-matching defaults (5k/500k/2M)", () => {
    expect(DEFAULT_EXTRACT_THRESHOLDS).toEqual({ asIsMax: 5_000, summarizeMax: 500_000, chunkMax: 2_000_000 });
    expect(classifyExtractTier(4_999)).toBe("as-is");
    expect(classifyExtractTier(500_000)).toBe("summarize");
    expect(classifyExtractTier(500_001)).toBe("chunk-synthesize");
    expect(classifyExtractTier(2_000_001)).toBe("refuse");
  });
});

describe("splitIntoChunks", () => {
  it("splits with no gaps or overlap — chunks rejoin to the exact original", () => {
    const text = "abcdefghij";
    const chunks = splitIntoChunks(text, 3);
    expect(chunks).toEqual(["abc", "def", "ghi", "j"]);
    expect(chunks.join("")).toBe(text);
  });

  it("returns one chunk when text is smaller than chunkSize", () => {
    expect(splitIntoChunks("short", 100)).toEqual(["short"]);
  });

  it("returns [] for empty text", () => {
    expect(splitIntoChunks("", 100)).toEqual([]);
  });
});

describe("refusalGuidance", () => {
  it("names the char count and the ceiling, with actionable next steps", () => {
    const msg = refusalGuidance(3_000_000, DEFAULT_EXTRACT_THRESHOLDS);
    expect(msg).toContain("3,000,000");
    expect(msg).toContain("2,000,000");
    expect(msg).toMatch(/focused source|paste/);
  });
});

describe("runExtractPipeline", () => {
  const smallThresholds: ExtractThresholds = { asIsMax: 10, summarizeMax: 30, chunkMax: 70 };

  it("as-is tier: returns the text unchanged, never calls summarize", async () => {
    const summarize = vi.fn(async (t: string) => `SUM(${t})`);
    const r = await runExtractPipeline("short text", { thresholds: smallThresholds, summarize });
    expect(r).toEqual({ tier: "as-is", output: "short text" });
    expect(summarize).not.toHaveBeenCalled();
  });

  it("summarize tier: one summarize call targeting the final length", async () => {
    const summarize = vi.fn(async (t: string, target: number) => `SUM(${t.length},${target})`);
    const text = "x".repeat(20); // 10 < 20 <= 30 → summarize tier
    const r = await runExtractPipeline(text, { thresholds: smallThresholds, summarize });
    expect(r.tier).toBe("summarize");
    expect(summarize).toHaveBeenCalledOnce();
    expect(summarize).toHaveBeenCalledWith(text, 5_000);
    expect(r.output).toBe("SUM(20,5000)");
  });

  it("chunk-synthesize tier: summarizes every chunk concurrently, then one final synthesis pass", async () => {
    const calls: Array<[number, number]> = [];
    const summarize = vi.fn(async (t: string, target: number) => {
      calls.push([t.length, target]);
      return `S${calls.length}`;
    });
    const text = "y".repeat(50); // 30 < 50 <= 70 → chunk-synthesize tier
    const r = await runExtractPipeline(text, { thresholds: smallThresholds, chunkSize: 20, summarize });
    expect(r.tier).toBe("chunk-synthesize");
    // 50 chars / 20-char chunks → 3 chunks (20,20,10), each summarized at the
    // per-chunk target (2000), then ONE more call over the joined summaries.
    expect(summarize).toHaveBeenCalledTimes(4);
    expect(calls.slice(0, 3).map(([, target]) => target)).toEqual([2_000, 2_000, 2_000]);
    expect(calls[3]).toEqual(["S1\n\nS2\n\nS3".length, 5_000]);
    expect(r.output).toBe("S4"); // the 4th call's return value
  });

  it("refuse tier: returns guidance, never calls summarize", async () => {
    const summarize = vi.fn(async (t: string) => `SUM(${t})`);
    const text = "z".repeat(80); // > 70 chunkMax → refuse
    const r = await runExtractPipeline(text, { thresholds: smallThresholds, summarize });
    expect(r.tier).toBe("refuse");
    expect(r.output).toContain("80");
    expect(summarize).not.toHaveBeenCalled();
  });

  it("defaults to DEFAULT_EXTRACT_THRESHOLDS and DEFAULT_CHUNK_SIZE when omitted", async () => {
    const summarize = vi.fn(async () => "ok");
    const r = await runExtractPipeline("tiny", { summarize });
    expect(r).toEqual({ tier: "as-is", output: "tiny" });
  });
});
