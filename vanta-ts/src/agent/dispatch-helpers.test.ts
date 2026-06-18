import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compressOutput } from "./dispatch-helpers.js";
import { retrieveOriginal } from "../compress/store.js";

// TOON view for read_file on JSON object-array files (lossless; original recoverable).
describe("compressOutput — TOON for read_file JSON files", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "vanta-toon-rf-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  const bigJson = JSON.stringify(
    Array.from({ length: 120 }, (_, i) => ({ id: i, name: `item-${i}`, status: "active" })),
  );

  it("renders a large JSON-array file as a lossless TOON view + retrievable original", async () => {
    const r = await compressOutput("read_file", bigJson, dir);
    expect(r.output.startsWith("TOON ")).toBe(true);
    expect(r.output).toContain("retrieve_original");
    expect(r.output).toContain("do not write this view back");
    expect(r.tokensSaved).toBeGreaterThan(0);
    const id = /id="([a-f0-9]+)"/.exec(r.output)?.[1];
    expect(await retrieveOriginal(join(dir, ".vanta"), id!)).toBe(bigJson); // exact bytes recoverable
  });

  it("does not TOON a TS file read (stays on the AST/text path)", async () => {
    const ts = "export function f() { const x = 1; return x; }\n".repeat(20);
    const r = await compressOutput("read_file", ts, dir);
    expect(r.output.startsWith("TOON ")).toBe(false);
  });

  it("leaves a small JSON read untouched (under the floor)", async () => {
    const small = JSON.stringify([{ id: 1 }, { id: 2 }]);
    const r = await compressOutput("read_file", small, dir);
    expect(r.output).toBe(small);
  });

  it("VANTA_TOON_DICT=1 switches a low-cardinality read to columnar TOON (lossless)", async () => {
    const lowCard = JSON.stringify(
      Array.from({ length: 150 }, (_, i) => ({ id: i, status: ["active", "idle", "pending"][i % 3], region: "us-east-1", tier: ["a", "b"][i % 2] })),
    );
    const prev = process.env.VANTA_TOON_DICT;
    try {
      const plain = await compressOutput("read_file", lowCard, dir);
      expect(plain.output.startsWith("TOON ")).toBe(true); // default = plain TOON

      process.env.VANTA_TOON_DICT = "1";
      const dict = await compressOutput("read_file", lowCard, dir);
      expect(dict.output.startsWith("TOONC ")).toBe(true); // columnar
      expect(dict.output).toContain("columnar TOON");
      const { decodeTable } = await import("winnow");
      const table = dict.output.split("\n").slice(0, -1).join("\n");
      expect(decodeTable(table)).toHaveLength(150); // lossless
    } finally {
      if (prev === undefined) delete process.env.VANTA_TOON_DICT; else process.env.VANTA_TOON_DICT = prev;
    }
  });

  it("respects VANTA_TOON_READFILE=0", async () => {
    const prev = process.env.VANTA_TOON_READFILE;
    process.env.VANTA_TOON_READFILE = "0";
    try {
      const r = await compressOutput("read_file", bigJson, dir);
      expect(r.output).toBe(bigJson);
    } finally {
      if (prev === undefined) delete process.env.VANTA_TOON_READFILE;
      else process.env.VANTA_TOON_READFILE = prev;
    }
  });
});
