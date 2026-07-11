import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestCorpus } from "./ingest.js";
import { recallCorpus } from "./recall.js";
import { refreshCorpus, corpusStatus } from "./refresh.js";
import { exportCorpusVault } from "./vault.js";

let root: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  root = join(tmpdir(), `vanta-corpus-${Date.now()}-${Math.random()}`);
  env = { VANTA_HOME: join(root, "home") };
  await mkdir(root, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("corpus compiler", () => {
  it("ingests supported local notes and downloaded transcripts with receipts", async () => {
    const source = join(root, "knowledge");
    await mkdir(join(source, ".hidden"), { recursive: true });
    await writeFile(join(source, "launch.md"), "# Launch\nCaroline approved the Atlas release.");
    await writeFile(join(source, "meeting.vtt"), "WEBVTT\n\n00:00.000 --> 00:02.000\nAtlas needs receipts.");
    await writeFile(join(source, ".env"), "SECRET=nope");
    await writeFile(join(source, "image.png"), "not really an image");

    const result = await ingestCorpus(source, { env, embedder: async () => [1, 0] });

    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(2);
    expect(result.sources.map((item) => item.relativePath)).toEqual(["launch.md", "meeting.vtt"]);
    expect(result.sources[0]).toMatchObject({ kind: "local", freshness: "fresh" });
    expect(result.sources[0]?.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.sources[0]?.chunks[0]?.embedding).toEqual([1, 0]);
  });

  it("guards URL ingest and retains the canonical source URL and date", async () => {
    let fetched = false;
    const sourceUrl = "https://example.com/atlas";
    const result = await ingestCorpus(sourceUrl, {
      env,
      guard: async () => ({ ok: true }),
      fetcher: async () => {
        fetched = true;
        return new Response("<html><body><main><h1>Atlas</h1><p>Remote source text.</p></main></body></html>", {
          headers: { "content-type": "text/html", "last-modified": "Wed, 01 Jul 2026 00:00:00 GMT" },
        });
      },
      embedder: async () => null,
    });

    expect(fetched).toBe(true);
    expect(result.sources[0]).toMatchObject({ kind: "url", origin: sourceUrl, sourceDate: "2026-07-01T00:00:00.000Z" });
    expect(result.sources[0]?.chunks[0]?.text).toContain("Remote source text");

    await expect(ingestCorpus("http://127.0.0.1/private", {
      env,
      guard: async () => ({ ok: false, error: "private address" }),
      fetcher: async () => { throw new Error("must not fetch"); },
    })).rejects.toThrow("private address");
  });

  it("fuses keyword, semantic, and entity signals and returns freshness receipts", async () => {
    const source = join(root, "knowledge");
    await mkdir(source);
    await writeFile(join(source, "atlas.md"), "Caroline owns the Atlas launch checklist and receipt policy.");
    await writeFile(join(source, "other.md"), "Generic release notes for another product.");
    const vectors: Record<string, number[]> = {
      "Caroline owns the Atlas launch checklist and receipt policy.": [1, 0],
      "Generic release notes for another product.": [0, 1],
      "What did Caroline decide about Atlas?": [1, 0],
    };
    const embedder = async (text: string) => vectors[text] ?? null;
    await ingestCorpus(source, { env, embedder });

    const result = await recallCorpus("What did Caroline decide about Atlas?", { env, embedder, limit: 2 });

    expect(result.signals).toEqual(["keyword", "semantic", "entity"]);
    expect(result.hits[0]?.source.relativePath).toBe("atlas.md");
    expect(result.hits[0]?.receipt).toMatchObject({ freshness: "fresh" });
    expect(result.hits[0]?.receipt.source).toContain("atlas.md");
    expect(result.hits[0]?.entityLinks).toContain("caroline");
  });

  it("marks old local sources stale and refreshes changed content", async () => {
    const file = join(root, "old.md");
    await writeFile(file, "Atlas v1 notes");
    const old = new Date("2025-01-01T00:00:00Z");
    await utimes(file, old, old);
    const first = await ingestCorpus(file, { env, now: new Date("2026-07-11T00:00:00Z"), staleAfterDays: 30 });
    expect(first.sources[0]?.freshness).toBe("stale");
    expect((await corpusStatus({ env, now: new Date("2026-07-11T00:00:00Z") })).stale).toBe(1);

    await writeFile(file, "Atlas v2 notes with receipts");
    const refreshed = await refreshCorpus(first.sources[0]!.id, { env, now: new Date("2026-07-11T01:00:00Z"), embedder: async () => null });

    expect(refreshed.refreshed).toBe(1);
    expect(refreshed.sources[0]?.chunks[0]?.text).toContain("v2 notes");
    expect(refreshed.sources[0]?.refreshedAt).toBe("2026-07-11T01:00:00.000Z");
  });

  it("previews then exports raw sources and linked corpus pages to a vault", async () => {
    const file = join(root, "atlas.md");
    const vault = join(root, "vault");
    await writeFile(file, "# Atlas\nCaroline owns the launch receipt.");
    await ingestCorpus(file, { env, embedder: async () => null });

    const preview = await exportCorpusVault(vault, { env });
    expect(preview.changed).toContain("wiki/corpus/INDEX.md");
    await expect(readFile(join(vault, "wiki", "corpus", "INDEX.md"), "utf8")).rejects.toThrow();

    const applied = await exportCorpusVault(vault, { env, apply: true });
    const index = await readFile(join(vault, "wiki", "corpus", "INDEX.md"), "utf8");
    const page = await readFile(join(vault, "wiki", "corpus", `${applied.sourceIds[0]}.md`), "utf8");
    expect(index).toContain("[[wiki/corpus/");
    expect(page).toContain("[[raw/corpus/");
    expect(page).toContain("[[wiki/entities/caroline|Caroline]]");
  });
});
