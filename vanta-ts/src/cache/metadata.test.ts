import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readMetadataCache,
  writeMetadataCache,
} from "./metadata.js";

const roots: string[] = [];

async function fixture(): Promise<{ root: string; source: string; cache: string }> {
  const root = await mkdtemp(join(tmpdir(), "vanta-metadata-cache-"));
  roots.push(root);
  const source = join(root, "source.txt");
  const cache = join(root, "cache", "artifact.json");
  await writeFile(source, "alpha", "utf8");
  return { root, source, cache };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("metadata cache", () => {
  it("survives a process-style reread while source metadata is unchanged", async () => {
    const { source, cache } = await fixture();
    await writeMetadataCache(cache, 1, { value: "cached" }, [source]);

    await expect(readMetadataCache<{ value: string }>(cache, 1)).resolves.toEqual({ value: "cached" });
    await expect(readMetadataCache<{ value: string }>(cache, 1)).resolves.toEqual({ value: "cached" });
  });

  it("invalidates when a source changes or a formerly missing source appears", async () => {
    const { root, source, cache } = await fixture();
    const missing = join(root, "missing.json");
    await writeMetadataCache(cache, 1, { value: "cached" }, [source, missing]);

    await writeFile(source, "alpha changed", "utf8");
    await expect(readMetadataCache(cache, 1)).resolves.toBeNull();

    await writeMetadataCache(cache, 1, { value: "new" }, [source, missing]);
    await writeFile(missing, "{}", "utf8");
    await expect(readMetadataCache(cache, 1)).resolves.toBeNull();
  });

  it("treats a corrupt cache or wrong version as a miss", async () => {
    const { source, cache } = await fixture();
    await writeMetadataCache(cache, 1, { value: "cached" }, [source]);
    await expect(readMetadataCache(cache, 2)).resolves.toBeNull();
    await writeFile(cache, "{not-json", "utf8");
    await expect(readMetadataCache(cache, 1)).resolves.toBeNull();
  });

  it("writes atomically with owner-only permissions", async () => {
    const { source, cache } = await fixture();
    await writeMetadataCache(cache, 1, { value: "cached" }, [source]);
    const raw = await readFile(cache, "utf8");
    expect(JSON.parse(raw).value).toEqual({ value: "cached" });
    const { mode } = await import("node:fs/promises").then(({ stat }) => stat(cache));
    expect(mode & 0o077).toBe(0);
  });
});
