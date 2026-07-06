import { describe, it, expect } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateMediaSend, mediaMaxAgeMs, type MediaGuardOpts } from "./media-send-guard.js";

// MSG-MEDIA-PATH-RECENCY — a file send must be in-scope AND recently produced.

const NOW = 10_000_000_000; // epoch ms

function opts(root: string, over: Partial<MediaGuardOpts> = {}): MediaGuardOpts {
  return {
    root,
    env: {},
    now: NOW,
    stat: async () => NOW - 60_000, // 1m old by default (fresh)
    maxAgeMs: 60 * 60 * 1000,
    ...over,
  };
}

describe("mediaMaxAgeMs", () => {
  it("defaults to 1h and reads VANTA_MEDIA_MAX_AGE_SEC", () => {
    expect(mediaMaxAgeMs({})).toBe(3_600_000);
    expect(mediaMaxAgeMs({ VANTA_MEDIA_MAX_AGE_SEC: "120" })).toBe(120_000);
  });
});

describe("validateMediaSend", () => {
  it("allows a fresh, in-scope file", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-media-"));
    const r = await validateMediaSend(join(root, "chart.png"), opts(root));
    expect(r.ok).toBe(true);
  });

  it("REJECTS an in-scope but OLD file (the anti-exfil case)", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-media-"));
    const twoHoursAgo = NOW - 2 * 60 * 60 * 1000;
    const r = await validateMediaSend(join(root, "secret-dump.png"), opts(root, { stat: async () => twoHoursAgo }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("recently-produced artifact");
  });

  it("REJECTS an out-of-scope path before even stat-ing it (scope wins first)", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-media-"));
    let statted = false;
    const r = await validateMediaSend("/etc/passwd", opts(root, { stat: async () => { statted = true; return NOW; } }));
    expect(r.ok).toBe(false);
    expect(statted).toBe(false); // no stat on a path we'd refuse for scope anyway
  });

  it("rejects a protected credential path with the scope reason", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-media-"));
    const r = await validateMediaSend("~/.ssh/id_rsa", opts(root, { stat: async () => NOW }));
    expect(r.ok).toBe(false);
  });

  it("rejects a nonexistent/unreadable file (null mtime)", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-media-"));
    const r = await validateMediaSend(join(root, "gone.png"), opts(root, { stat: async () => null }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("does not exist");
  });

  it("honors a custom recency window from env", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-media-"));
    const fiveMinAgo = NOW - 5 * 60_000;
    // 2-minute window → a 5-minute-old file is too old.
    const r = await validateMediaSend(join(root, "x.png"), { root, env: { VANTA_MEDIA_MAX_AGE_SEC: "120" }, now: NOW, stat: async () => fiveMinAgo });
    expect(r.ok).toBe(false);
  });
});
