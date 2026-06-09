import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyCompression, compressEnabled, shouldCompressTool } from "./apply.js";
import { compressText } from "./router.js";
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

describe("shouldCompressTool (read-fidelity allow-list)", () => {
  // Precision reads the agent acts on EXACTLY — never compress (lossy view would
  // shift line numbers / elide JSON, breaking file:line edits and citations).
  it.each(["read_file", "inspect_state", "lsp_diagnostics", "lsp_definition", "git_diff", "grep"])(
    "never compresses precision read %s",
    (name) => expect(shouldCompressTool(name)).toBe(false),
  );

  // Voluminous, advisory media/web outputs — safe to compress (where the win is).
  it.each(["describe_image", "screenshot", "look_at_screen", "watch_video", "web_fetch", "web_search"])(
    "compresses voluminous output %s",
    (name) => expect(shouldCompressTool(name)).toBe(true),
  );

  it("is default-safe for an unknown/future tool", () =>
    expect(shouldCompressTool("some_new_tool")).toBe(false));
});

describe("read-fidelity: the router WOULD mangle real reads (proving why the allow-list matters)", () => {
  it("json-crush elides a JSON data file's middle — must never hit read_file output", () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ id: i, v: `row-${i}` }));
    const jsonFile = JSON.stringify(rows, null, 2);
    const r = compressText(jsonFile);
    expect(r.compressed).toBe(true); // lossy: would corrupt a file read
    expect(r.text).toContain("__elided__");
    // The guarantee: read_file is NOT on the allow-list, so this transform never runs on it.
    expect(shouldCompressTool("read_file")).toBe(false);
  });

  it("log-squash collapses blank-line runs — would shift line numbers in source", () => {
    const py = "def a():\n    pass\n\n\n\ndef b():\n    pass\n";
    const r = compressText(py.repeat(60)); // large enough to cross the floor
    // If this ran on a file read, line numbers would shift; allow-list prevents it.
    expect(shouldCompressTool("read_file")).toBe(false);
    expect(shouldCompressTool("lsp_definition")).toBe(false);
  });
});
