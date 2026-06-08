import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ingestAsset, loadAssets, searchAssets, formatAssets, TASTE_TAGS } from "./asset-index.js";

let home: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-taste-"));
  env = { VANTA_HOME: home };
});

afterEach(async () => {
  await rm(home, { recursive: true }).catch(() => {});
});

describe("ingestAsset / loadAssets", () => {
  it("ingests a URL and loads it", async () => {
    await ingestAsset({ source: "https://example.com", tags: ["operator-dossier"], env });
    const assets = await loadAssets(env);
    expect(assets.length).toBe(1);
    expect(assets[0]?.tags).toContain("operator-dossier");
  });

  it("updates existing asset with same source", async () => {
    await ingestAsset({ source: "https://x.com", tags: ["too-generic"], env });
    await ingestAsset({ source: "https://x.com", tags: ["operator-dossier"], env });
    const assets = await loadAssets(env);
    expect(assets.length).toBe(1);
    expect(assets[0]?.tags).toContain("operator-dossier");
  });
});

describe("searchAssets", () => {
  it("finds by tag substring", async () => {
    await ingestAsset({ source: "https://a.com", tags: ["schematic-rail"], env });
    await ingestAsset({ source: "https://b.com", tags: ["too-mascot"], env });
    const results = await searchAssets("schematic", env);
    expect(results.length).toBe(1);
    expect(results[0]?.source).toBe("https://a.com");
  });
});

describe("formatAssets", () => {
  it("shows empty message", () => { expect(formatAssets([])).toContain("no taste"); });
  it("includes title + tags", async () => {
    const a = await ingestAsset({ source: "https://a.com", title: "My Ref", tags: ["glyph-system"], env });
    expect(formatAssets([a])).toContain("glyph-system");
  });
});

describe("TASTE_TAGS", () => {
  it("includes operator-dossier and too-generic", () => {
    expect(TASTE_TAGS).toContain("operator-dossier");
    expect(TASTE_TAGS).toContain("too-generic");
  });
});
