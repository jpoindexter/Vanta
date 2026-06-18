import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  offloadResult,
  resolveMaxResultChars,
  DEFAULT_MAX_RESULT_CHARS,
} from "./result-offload.js";
import { retrieveOriginal } from "./store.js";

describe("offloadResult (size-based CCR offload)", () => {
  let dataDir: string;
  beforeEach(async () => {
    dataDir = join(await mkdtemp(join(tmpdir(), "vanta-offload-")), ".vanta");
  });
  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("passes under-limit text through unchanged", async () => {
    const small = "a small tool output well under the limit";
    const r = await offloadResult(small, { toolName: "read_file", dataDir, env: {} });
    expect(r.offloaded).toBe(false);
    expect(r.output).toBe(small);
  });

  it("offloads over-limit text to a shorter preview + retrieval reference", async () => {
    const big = "x".repeat(DEFAULT_MAX_RESULT_CHARS + 1);
    const r = await offloadResult(big, { toolName: "read_file", dataDir, env: {} });

    expect(r.offloaded).toBe(true);
    expect(r.output.length).toBeLessThan(big.length);
    // Deterministic preview = the leading slice of the original.
    expect(r.output.startsWith("x".repeat(2_000))).toBe(true);
    // Retrieval reference uses the existing retrieve_original vocabulary.
    expect(r.output).toContain("output truncated");
    expect(r.output).toContain("retrieve_original");
    expect(r.output).toContain(`${big.length} chars`);
  });

  it("makes the full text retrievable from the CCR store via the footer id", async () => {
    const big = "line\n".repeat(DEFAULT_MAX_RESULT_CHARS); // >> limit
    const r = await offloadResult(big, { toolName: "shell_cmd", dataDir, env: {} });

    const id = /original_id="([a-f0-9]+)"/.exec(r.output)?.[1];
    expect(id).toBeTruthy();
    expect(await retrieveOriginal(dataDir, id!)).toBe(big);
  });

  it("strong backbone → file delivery: grep-able path + summary + retrieval id", async () => {
    const big = "first meaningful line\n" + "x".repeat(DEFAULT_MAX_RESULT_CHARS);
    const r = await offloadResult(big, { toolName: "read_file", dataDir, env: {}, modelId: "claude-opus-4-8" });
    expect(r.delivery).toBe("file");
    expect(r.output).toContain(".vanta/ccr/");
    expect(r.output).toContain("grep-able file");
    expect(r.output).toContain("summary: first meaningful line");
    expect(r.output).toContain("retrieve_original");
  });

  it("weak backbone never gets a file-only pointer — larger inline window instead", async () => {
    const big = "x".repeat(DEFAULT_MAX_RESULT_CHARS + 5_000);
    const r = await offloadResult(big, { toolName: "read_file", dataDir, env: {}, modelId: "gpt-4o-mini" });
    expect(r.delivery).toBe("inline");
    expect(r.output).toContain("fit a smaller model");
    expect(r.output).not.toContain("retrieve_original"); // not relying on a retrieval loop
    expect(r.output.startsWith("x".repeat(8_000))).toBe(true); // larger inline window
    // full content is still stashed losslessly for recovery
    const id = /original_id="([a-f0-9]+)"/.exec(r.output)?.[1];
    expect(await retrieveOriginal(dataDir, id!)).toBe(big);
  });

  it("never throws — returns the original on a stash failure", async () => {
    const big = "y".repeat(DEFAULT_MAX_RESULT_CHARS + 1);
    const r = await offloadResult(big, { toolName: "read_file", dataDir: "/dev/null/nope", env: {} });
    expect(r.offloaded).toBe(false);
    expect(r.output).toBe(big);
  });
});

describe("resolveMaxResultChars", () => {
  it("defaults to DEFAULT_MAX_RESULT_CHARS with no override", () => {
    expect(resolveMaxResultChars("read_file", {})).toBe(DEFAULT_MAX_RESULT_CHARS);
  });

  it("honors the VANTA_MAX_RESULT_CHARS env override", () => {
    expect(resolveMaxResultChars("read_file", { VANTA_MAX_RESULT_CHARS: "1000" })).toBe(1000);
  });

  it("ignores a non-positive or non-numeric env override", () => {
    expect(resolveMaxResultChars("read_file", { VANTA_MAX_RESULT_CHARS: "abc" })).toBe(
      DEFAULT_MAX_RESULT_CHARS,
    );
    expect(resolveMaxResultChars("read_file", { VANTA_MAX_RESULT_CHARS: "0" })).toBe(
      DEFAULT_MAX_RESULT_CHARS,
    );
  });
});
