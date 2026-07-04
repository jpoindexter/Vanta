import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractReadable, webFetchTool, __resetWebFetchMemo } from "./web-fetch.js";
import { SKIP_WEBFETCH_PREFLIGHT_ENV } from "./webfetch-preflight.js";
import type { ToolContext } from "./types.js";

// WEB-EXTRACT-PIPELINE: mock the auxiliary provider resolution so large-page
// tests never hit a real network/model — existing small fixtures below never
// reach this path (they resolve to the as-is tier), so it's safe file-wide.
const completeSpy = vi.hoisted(() => vi.fn(async () => ({ text: "MOCKED SUMMARY", toolCalls: [], finishReason: "stop" as const })));
vi.mock("../routing/extract.js", () => ({
  resolveExtractProvider: () => ({ complete: completeSpy, modelId: () => "fake-extract-model", contextWindow: () => 100_000 }),
}));

const ARTICLE_HTML = `<!doctype html>
<html>
  <head>
    <title>The Migration of Arctic Terns</title>
  </head>
  <body>
    <nav><a href="/home">Home</a><a href="/about">About</a></nav>
    <script>window.tracking = function(){ console.log("pixel"); };</script>
    <article>
      <h1>The Migration of Arctic Terns</h1>
      <p>The Arctic tern undertakes the longest known migration of any animal,
      flying from its Arctic breeding grounds in the far north all the way down
      to the Antarctic pack ice and back again over the course of a single year.</p>
      <p>Over its lifetime a single bird may travel a distance equivalent to
      three round trips to the Moon, all powered by an unremarkable diet of small
      fish and crustaceans plucked from the surface of the open ocean.</p>
      <p>Researchers tracking the birds with tiny geolocators discovered that the
      terns do not fly in a straight line, but instead follow looping, wind-assisted
      routes across the Atlantic that add thousands of kilometres to the journey
      while saving a great deal of precious energy along the way.</p>
      <p>Because the tern chases an endless summer at both poles, it sees more
      daylight in a year than any other creature on Earth, a fact that has long
      fascinated ornithologists and casual birdwatchers alike around the world.</p>
    </article>
    <footer>Copyright 2026 Ornithology Weekly</footer>
  </body>
</html>`;

describe("extractReadable", () => {
  it("returns the document title from the head", () => {
    const { title } = extractReadable(ARTICLE_HTML, "https://example.com/terns");

    expect(title).toBe("The Migration of Arctic Terns");
  });

  it("returns the article prose as text", () => {
    const { text } = extractReadable(ARTICLE_HTML, "https://example.com/terns");

    expect(text).toContain("longest known migration of any animal");
    expect(text).toContain("three round trips to the Moon");
  });

  it("excludes nav and script noise from the text", () => {
    const { text } = extractReadable(ARTICLE_HTML, "https://example.com/terns");

    expect(text).not.toContain("window.tracking");
    expect(text).not.toContain("pixel");
    expect(text).not.toContain("Home");
  });

  it("falls back to body text when there is no parseable article", () => {
    const html = "<html><body><div>Just a bare fragment of text.</div></body></html>";

    const { title, text } = extractReadable(html, "https://example.com/bare");

    expect(title).toBe("");
    expect(text).toContain("Just a bare fragment of text.");
  });
});

// web_fetch reads ctx.root (to loadSettings) but nothing else off the context.
// A real empty temp root + an isolated VANTA_HOME means no settings.json exists,
// so shouldSkipPreflight resolves false → today's preflight-ON behavior.
let tmp: string;
let fakeCtx: ToolContext;
const ORIGINAL_HOME = process.env.VANTA_HOME;
const ORIGINAL_SKIP = process.env[SKIP_WEBFETCH_PREFLIGHT_ENV];

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "vanta-webfetch-"));
  process.env.VANTA_HOME = join(tmp, "home");
  delete process.env[SKIP_WEBFETCH_PREFLIGHT_ENV];
  fakeCtx = { root: tmp } as ToolContext;
  __resetWebFetchMemo();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  if (ORIGINAL_HOME === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = ORIGINAL_HOME;
  if (ORIGINAL_SKIP === undefined) delete process.env[SKIP_WEBFETCH_PREFLIGHT_ENV];
  else process.env[SKIP_WEBFETCH_PREFLIGHT_ENV] = ORIGINAL_SKIP;
  await rm(tmp, { recursive: true, force: true });
});

describe("webFetchTool SSRF guard", () => {
  it("refuses to follow a redirect to cloud metadata", async () => {
    // 1.1.1.1 is a public literal IP (passes the first guard), but it 302s to
    // the metadata service. The guard must re-validate the hop and block it
    // BEFORE a second fetch is issued — the redirect/rebind SSRF case.
    const fetchSpy = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/" } }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const res = await webFetchTool.execute({ url: "https://1.1.1.1/redir" }, fakeCtx);

    expect(res.ok).toBe(false);
    expect(res.output).toContain("169.254.169.254");
    expect(fetchSpy).toHaveBeenCalledTimes(1); // hop validated, second fetch never issued
  });

  it("blocks a direct fetch of a loopback URL without any network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await webFetchTool.execute({ url: "http://127.0.0.1:7788/api/status" }, fakeCtx);

    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("webFetchTool skipWebFetchPreflight bypass", () => {
  it("still guards a loopback URL when the env override is unset (byte-identical default)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await webFetchTool.execute({ url: "http://127.0.0.1:7788/api/status" }, fakeCtx);

    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled(); // guard ran, no network — unchanged
  });

  it("bypasses the preflight guard when VANTA_SKIP_WEBFETCH_PREFLIGHT is set", async () => {
    process.env[SKIP_WEBFETCH_PREFLIGHT_ENV] = "1";
    // With the guard skipped, the loopback URL is actually fetched. Stub the
    // network so the request is observable without touching a real host.
    const fetchSpy = vi.fn(async () =>
      new Response("<html><body><p>ok</p></body></html>", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const res = await webFetchTool.execute({ url: "http://127.0.0.1:7788/api/status" }, fakeCtx);

    expect(res.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // guard skipped → the fetch is issued
  });
});

describe("webFetchTool failed-URL memo", () => {
  beforeEach(() => { process.env[SKIP_WEBFETCH_PREFLIGHT_ENV] = "1"; }); // bypass SSRF guard for the stub

  it("memoizes a 404 and short-circuits the retry without re-fetching", async () => {
    const fetchSpy = vi.fn(async () => new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetchSpy);
    const url = "https://theft.studio/";

    const first = await webFetchTool.execute({ url }, fakeCtx);
    expect(first.ok).toBe(false);
    expect(first.output).toContain("404");
    expect(first.output).toMatch(/do NOT retry/i);

    const second = await webFetchTool.execute({ url }, fakeCtx);
    expect(second.ok).toBe(false);
    expect(second.output).toMatch(/already failed|skipped/i);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // the second call never hit the network
  });

  it("classifies a 403 as a likely Cloudflare/bot block", async () => {
    const fetchSpy = vi.fn(async () => new Response("", { status: 403 }));
    vi.stubGlobal("fetch", fetchSpy);

    const res = await webFetchTool.execute({ url: "https://cf-blocked.example/" }, fakeCtx);
    expect(res.ok).toBe(false);
    expect(res.output).toMatch(/blocked.*Cloudflare|Cloudflare.*blocked/i);
  });

  it("lets a different URL through after one failed", async () => {
    const fetchSpy = vi.fn(async (u: string) =>
      u.includes("dead") ? new Response("", { status: 404 }) : new Response("<title>Live</title><p>hello there world</p>", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await webFetchTool.execute({ url: "https://dead.example/" }, fakeCtx);
    const ok = await webFetchTool.execute({ url: "https://live.example/" }, fakeCtx);
    expect(ok.ok).toBe(true);
  });
});

// WEB-EXTRACT-PIPELINE: a page's extracted text is routed by size instead of
// being blindly truncated.
describe("webFetchTool size-tiered extract pipeline", () => {
  beforeEach(() => {
    process.env[SKIP_WEBFETCH_PREFLIGHT_ENV] = "1"; // bypass SSRF guard for the stub
    completeSpy.mockClear();
  });

  function htmlOfLength(paragraphChars: number): string {
    // One long <article><p> so extractReadable returns exactly this much text
    // (a title-less body means output === the raw text, no "# Title\n\n" prefix).
    return `<html><body><article><p>${"a".repeat(paragraphChars)}</p></article></body></html>`;
  }

  it("a small page (as-is tier) is returned unchanged — no summarize call", async () => {
    const fetchSpy = vi.fn(async () => new Response(htmlOfLength(200), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const res = await webFetchTool.execute({ url: "https://small.example/" }, fakeCtx);
    expect(res.ok).toBe(true);
    expect(res.output).toContain("a".repeat(200));
    expect(completeSpy).not.toHaveBeenCalled();
  });

  it("a large page (summarize tier) is summarized via the auxiliary provider", async () => {
    process.env.VANTA_EXTRACT_ASIS_MAX = "100"; // force the tier boundaries down so a modest fixture crosses them
    process.env.VANTA_EXTRACT_SUMMARIZE_MAX = "10000";
    const fetchSpy = vi.fn(async () => new Response(htmlOfLength(500), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const res = await webFetchTool.execute({ url: "https://medium.example/" }, fakeCtx);
    expect(res.ok).toBe(true);
    expect(res.output).toBe("MOCKED SUMMARY");
    expect(completeSpy).toHaveBeenCalledOnce();
    delete process.env.VANTA_EXTRACT_ASIS_MAX;
    delete process.env.VANTA_EXTRACT_SUMMARIZE_MAX;
  });

  it("a huge page (chunk-synthesize tier) summarizes each chunk then synthesizes once more", async () => {
    process.env.VANTA_EXTRACT_ASIS_MAX = "10";
    process.env.VANTA_EXTRACT_SUMMARIZE_MAX = "20";
    process.env.VANTA_EXTRACT_CHUNK_MAX = "1000";
    process.env.VANTA_EXTRACT_CHUNK_SIZE = "100";
    const fetchSpy = vi.fn(async () => new Response(htmlOfLength(300), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const res = await webFetchTool.execute({ url: "https://huge.example/" }, fakeCtx);
    expect(res.ok).toBe(true);
    expect(res.output).toBe("MOCKED SUMMARY");
    expect(completeSpy.mock.calls.length).toBeGreaterThan(1); // per-chunk calls + one final synthesis
    delete process.env.VANTA_EXTRACT_ASIS_MAX;
    delete process.env.VANTA_EXTRACT_SUMMARIZE_MAX;
    delete process.env.VANTA_EXTRACT_CHUNK_MAX;
    delete process.env.VANTA_EXTRACT_CHUNK_SIZE;
  });

  it("a page past the hard ceiling is refused with actionable guidance — no summarize call", async () => {
    process.env.VANTA_EXTRACT_ASIS_MAX = "10";
    process.env.VANTA_EXTRACT_SUMMARIZE_MAX = "20";
    process.env.VANTA_EXTRACT_CHUNK_MAX = "50";
    const fetchSpy = vi.fn(async () => new Response(htmlOfLength(300), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const res = await webFetchTool.execute({ url: "https://toobig.example/" }, fakeCtx);
    expect(res.ok).toBe(false);
    expect(res.output).toMatch(/too large to extract/);
    expect(res.output).toMatch(/focused source|paste/);
    expect(completeSpy).not.toHaveBeenCalled();
    delete process.env.VANTA_EXTRACT_ASIS_MAX;
    delete process.env.VANTA_EXTRACT_SUMMARIZE_MAX;
    delete process.env.VANTA_EXTRACT_CHUNK_MAX;
  });
});
