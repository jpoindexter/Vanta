import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { transcribePodcastUrl } from "./podcast.js";

// The podcast channel downloads a remote, feed-supplied audio URL — the classic
// SSRF vector (an attacker-controlled RSS enclosure pointed at cloud metadata).
// assertPublicUrl gates downloadAudio's fetch; these prove a private/loopback
// URL is refused BEFORE any fetch, and a public URL is allowed through to it.
// The guard itself is tested in src/net/ssrf-guard.test.ts.

afterEach(() => vi.restoreAllMocks());

describe("transcribePodcastUrl SSRF guard", () => {
  beforeEach(() => {
    // Need a key, else it short-circuits before the download choke point.
    process.env.GROQ_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.GROQ_API_KEY;
    delete process.env.VANTA_ALLOW_PRIVATE_FETCH;
  });

  it("refuses a loopback audio URL before any fetch (errors-as-value, no throw)", async () => {
    // Guard ON (no opt-out). A literal loopback IP is blocked without DNS.
    delete process.env.VANTA_ALLOW_PRIVATE_FETCH;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const r = await transcribePodcastUrl("http://127.0.0.1/episode.mp3");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("blocked private/loopback address");
    expect(fetchSpy).not.toHaveBeenCalled(); // gated before the download
  });

  it("refuses the cloud-metadata audio URL before any fetch", async () => {
    delete process.env.VANTA_ALLOW_PRIVATE_FETCH;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const r = await transcribePodcastUrl("http://169.254.169.254/latest/meta-data/");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("blocked private/loopback address");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("lets a public audio URL through to the download fetch", async () => {
    // Opt out so the stub — not real DNS — answers for the reserved .test host.
    process.env.VANTA_ALLOW_PRIVATE_FETCH = "1";
    // Fail the download at the HTTP check (after the guard) so we don't need a
    // real audio stream; reaching fetch proves the guard let the URL through.
    const fetchSpy = vi.fn(async () => ({ ok: false, status: 404, body: null }));
    vi.stubGlobal("fetch", fetchSpy);

    const r = await transcribePodcastUrl("https://feeds.test/episode.mp3");
    expect(fetchSpy).toHaveBeenCalledOnce(); // got past the guard to the download
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("download failed: HTTP 404");
  });
});
