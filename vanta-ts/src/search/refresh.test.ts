import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  digestStore,
  detectChanges,
  loadDigests,
  saveDigests,
  type StoreDigests,
} from "./refresh.js";

// --- digestStore ---

describe("digestStore", () => {
  it("returns the same digest for identical input", () => {
    const d1 = digestStore("hello world");
    const d2 = digestStore("hello world");
    expect(d1).toBe(d2);
  });

  it("returns a different digest when content changes", () => {
    const d1 = digestStore("hello world");
    const d2 = digestStore("hello world!");
    expect(d1).not.toBe(d2);
  });

  it("returns an 8-char lowercase hex string", () => {
    const d = digestStore("test");
    expect(d).toMatch(/^[0-9a-f]{8}$/);
  });

  it("handles an empty string without throwing", () => {
    expect(() => digestStore("")).not.toThrow();
  });

  it("two different strings produce different hashes (collision resistance check)", () => {
    expect(digestStore("world")).not.toBe(digestStore("money"));
  });
});

// --- detectChanges ---

describe("detectChanges", () => {
  it("marks stores unchanged when digests match", () => {
    const prev: StoreDigests = { world: "aabbccdd", money: "11223344" };
    const next: StoreDigests = { world: "aabbccdd", money: "11223344" };
    const { changed, unchanged } = detectChanges(prev, next);
    expect(changed).toEqual([]);
    expect(unchanged.sort()).toEqual(["money", "world"]);
  });

  it("marks stores changed when digest differs", () => {
    const prev: StoreDigests = { world: "aabbccdd", money: "11223344" };
    const next: StoreDigests = { world: "deadbeef", money: "11223344" };
    const { changed, unchanged } = detectChanges(prev, next);
    expect(changed).toEqual(["world"]);
    expect(unchanged).toEqual(["money"]);
  });

  it("treats new stores (absent from prev) as changed", () => {
    const prev: StoreDigests = {};
    const next: StoreDigests = { world: "aabbccdd", radar: "deadbeef" };
    const { changed, unchanged } = detectChanges(prev, next);
    expect(changed.sort()).toEqual(["radar", "world"]);
    expect(unchanged).toEqual([]);
  });

  it("ignores stores in prev that are absent from next", () => {
    const prev: StoreDigests = { world: "aabbccdd", gone: "00000000" };
    const next: StoreDigests = { world: "aabbccdd" };
    const { changed, unchanged } = detectChanges(prev, next);
    expect(changed).toEqual([]);
    expect(unchanged).toEqual(["world"]);
  });
});

// --- persistence (loadDigests / saveDigests) ---

describe("loadDigests / saveDigests", () => {
  let tmpDir: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "vanta-refresh-test-"));
    env = { VANTA_HOME: tmpDir };
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns {} when no index file exists", async () => {
    const result = await loadDigests(env);
    expect(result).toEqual({});
  });

  it("round-trips digests through save + load", async () => {
    const digests: StoreDigests = { world: "aabbccdd", money: "11223344" };
    await saveDigests(digests, env);
    const loaded = await loadDigests(env);
    expect(loaded).toEqual(digests);
  });

  it("returns {} on corrupt file content (tolerant reader)", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(tmpDir, "life-index.json"), "not-json-at-all", "utf8");
    const result = await loadDigests(env);
    expect(result).toEqual({});
  });

  it("returns {} on a file with non-record JSON (tolerant reader)", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(tmpDir, "life-index.json"), JSON.stringify([1, 2, 3]), "utf8");
    const result = await loadDigests(env);
    expect(result).toEqual({});
  });
});
