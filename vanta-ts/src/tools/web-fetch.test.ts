import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractReadable, webFetchTool } from "./web-fetch.js";
import { SKIP_WEBFETCH_PREFLIGHT_ENV } from "./webfetch-preflight.js";
import type { ToolContext } from "./types.js";

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
