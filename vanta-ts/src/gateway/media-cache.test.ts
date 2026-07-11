import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheInboundMedia, isInsideDir, mediaCacheDir, mediaCacheTtlMs, pruneMediaCache } from "./media-cache.js";

describe("media cache", () => {
  it("writes inbound media under the Vanta media-cache dir with a TTL", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-media-cache-"));
    const r = await cacheInboundMedia(
      { kind: "image", mime: "image/png", dataBase64: "SU1H" },
      "SU1H",
      { env: { VANTA_HOME: home, VANTA_MEDIA_CACHE_TTL_MS: "1000" } },
    );

    expect(isInsideDir(mediaCacheDir({ VANTA_HOME: home }), r.path)).toBe(true);
    expect(await readFile(r.path, "utf8")).toBe("IMG");
    expect(r.bytes).toBe(3);
    expect(r.expiresAt).toBeGreaterThan(Date.now());
  });

  it("uses the default TTL unless a positive env override is supplied", () => {
    expect(mediaCacheTtlMs({ VANTA_MEDIA_CACHE_TTL_MS: "250" })).toBe(250);
    expect(mediaCacheTtlMs({ VANTA_MEDIA_CACHE_TTL_MS: "-1" })).toBe(24 * 60 * 60 * 1000);
  });

  it("prunes stale cache files and keeps fresh files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-media-prune-"));
    const old = await cacheInboundMedia({ kind: "image", mime: "image/png", dataBase64: "T0xE" }, "T0xE", { dir });
    const fresh = await cacheInboundMedia({ kind: "image", mime: "image/png", dataBase64: "TkVX" }, "TkVX", { dir });
    const now = Date.UTC(2026, 6, 11, 12, 0, 0);
    const staleDate = new Date(now - 10_000);
    const freshDate = new Date(now);
    await utimes(old.path, staleDate, staleDate);
    await utimes(fresh.path, freshDate, freshDate);

    await expect(pruneMediaCache({ dir, ttlMs: 1, now })).resolves.toBe(1);
    await expect(stat(old.path)).rejects.toThrow();
    await expect(stat(fresh.path)).resolves.toBeTruthy();
  });
});
