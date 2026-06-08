import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyCompression, compressEnabled } from "./apply.js";
import { retrieveOriginal } from "./store.js";

describe("applyCompression (CCR seam)", () => {
  let dataDir: string;
  beforeEach(async () => {
    dataDir = join(await mkdtemp(join(tmpdir(), "vanta-apply-")), ".vanta");
  });
  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("compresses a binary blob and round-trips the original via CCR", async () => {
    const blob = "\x80\x81\x82\x83".repeat(6000);
    const { output, tokensSaved } = await applyCompression(blob, dataDir);

    // Compressed body + retrieval footer, real savings.
    expect(tokensSaved).toBeGreaterThan(0);
    expect(output).toContain("vanta compressed");
    expect(output).toContain("retrieve_original");

    // The footer's original_id must round-trip to the exact original.
    const id = /original_id="([a-f0-9]+)"/.exec(output)?.[1];
    expect(id).toBeTruthy();
    expect(await retrieveOriginal(dataDir, id!)).toBe(blob);
  });

  it("leaves a small output untouched (no footer, no stash)", async () => {
    const small = "short tool output";
    const { output, tokensSaved } = await applyCompression(small, dataDir);
    expect(output).toBe(small);
    expect(tokensSaved).toBe(0);
  });

  it("never throws — returns the original on any internal failure", async () => {
    // A bogus data dir path is still handled (stash is best-effort).
    const blob = "\x80\x81".repeat(6000);
    const r = await applyCompression(blob, "/dev/null/nope");
    expect(typeof r.output).toBe("string");
    expect(r.output.length).toBeGreaterThan(0);
  });
});

describe("compressEnabled", () => {
  it("defaults on", () => expect(compressEnabled({})).toBe(true));
  it("off when VANTA_COMPRESS=0", () => expect(compressEnabled({ VANTA_COMPRESS: "0" })).toBe(false));
  it("off when VANTA_COMPRESS=false", () =>
    expect(compressEnabled({ VANTA_COMPRESS: "false" })).toBe(false));
});
