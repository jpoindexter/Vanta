import { describe, it, expect } from "vitest";
import { extractFromHtml, browserExtractTool } from "./browser-extract.js";

const PAGE_HTML = `<!doctype html>
<html>
  <head><title>Sample Page</title></head>
  <body>
    <nav>
      <a href="/home">Home</a>
      <a href="https://example.com/docs">Docs</a>
      <a>No href anchor</a>
    </nav>
    <p>The quick brown fox jumps over the lazy dog.</p>
    <table>
      <tr><th>Name</th><th>Role</th></tr>
      <tr><td>Ada</td><td>Engineer</td></tr>
      <tr><td>Grace</td><td>Admiral</td></tr>
    </table>
  </body>
</html>`;

describe("extractFromHtml", () => {
  it("returns trimmed, collapsed body text", () => {
    const out = extractFromHtml(PAGE_HTML, "text");

    expect(out).toContain("The quick brown fox jumps over the lazy dog.");
    expect(out).not.toMatch(/\s{2,}/);
  });

  it("returns one 'text — href' line per anchor with an href", () => {
    const out = extractFromHtml(PAGE_HTML, "links");
    const lines = out.split("\n");

    expect(lines).toContain("Home — /home");
    expect(lines).toContain("Docs — https://example.com/docs");
    // The hrefless anchor is skipped.
    expect(lines).toHaveLength(2);
  });

  it("renders tables as TSV rows", () => {
    const out = extractFromHtml(PAGE_HTML, "tables");

    expect(out).toBe("Name\tRole\nAda\tEngineer\nGrace\tAdmiral");
  });

  it("returns empty string for tables when the page has none", () => {
    const out = extractFromHtml("<html><body><p>no tables here</p></body></html>", "tables");

    expect(out).toBe("");
  });
});

describe("browserExtractTool.execute", () => {
  const ctx = {
    root: "/tmp",
    safety: {} as never,
    requestApproval: async () => false,
  };

  it("returns ok:false when url is missing or invalid", async () => {
    const res = await browserExtractTool.execute({ url: "not-a-url" }, ctx);

    expect(res.ok).toBe(false);
    expect(res.output).toContain("valid");
  });

  it("returns ok:false when url is absent entirely", async () => {
    const res = await browserExtractTool.execute({}, ctx);

    expect(res.ok).toBe(false);
  });

  it("denies (no browser launch) when domain is off-allowlist and approval is refused", async () => {
    const res = await browserExtractTool.execute(
      { url: "https://example.com/page" },
      ctx,
    );

    expect(res.ok).toBe(false);
    expect(res.output).toBe("denied by user");
  });
});

describe("browserExtractTool.describeForSafety", () => {
  it("returns only the url, never page content", () => {
    const desc = browserExtractTool.describeForSafety?.({
      url: "https://example.com/x",
    });

    expect(desc).toBe("extract from https://example.com/x");
  });
});
