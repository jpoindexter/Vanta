import { describe, it, expect } from "vitest";
import { detectLinks, hasLinks, resolveLinkTarget } from "./links.js";

describe("detectLinks — urls", () => {
  it("finds an http and an https url with correct offsets", () => {
    const line = "see https://example.com and http://a.io/x for more";
    const spans = detectLinks(line);
    expect(spans.map((s) => s.ref)).toEqual(["https://example.com", "http://a.io/x"]);
    expect(spans[0]!.kind).toBe("url");
    expect(line.slice(spans[0]!.start, spans[0]!.end)).toBe("https://example.com");
  });

  it("strips trailing sentence punctuation from a url", () => {
    expect(detectLinks("open https://example.com.")[0]!.ref).toBe("https://example.com");
    expect(detectLinks("(https://example.com)")[0]!.ref).toBe("https://example.com");
  });

  it("returns nothing for a line with no links", () => {
    expect(detectLinks("just some plain prose here")).toEqual([]);
    expect(hasLinks("just some plain prose here")).toBe(false);
  });
});

describe("detectLinks — file paths", () => {
  it("finds a relative path with an extension", () => {
    const spans = detectLinks("edit src/ui/app.tsx now");
    expect(spans).toHaveLength(1);
    expect(spans[0]!.kind).toBe("file");
    expect(spans[0]!.ref).toBe("src/ui/app.tsx");
  });

  it("keeps a file:line suffix", () => {
    expect(detectLinks("error at src/agent.ts:42 here")[0]!.ref).toBe("src/agent.ts:42");
    expect(detectLinks("at src/agent.ts:42:7 col")[0]!.ref).toBe("src/agent.ts:42:7");
  });

  it("does not treat bare words or extensionless tokens as files", () => {
    expect(detectLinks("the agent loop runs fine")).toEqual([]);
    expect(detectLinks("run npm test please")).toEqual([]);
  });

  it("handles ./, ../ and ~/ prefixes", () => {
    expect(detectLinks("see ./pkg/a.ts")[0]!.ref).toBe("./pkg/a.ts");
    expect(detectLinks("see ../b/c.json")[0]!.ref).toBe("../b/c.json");
    expect(detectLinks("see ~/notes/x.md")[0]!.ref).toBe("~/notes/x.md");
  });
});

describe("detectLinks — ordering + overlap", () => {
  it("orders mixed spans left to right", () => {
    const spans = detectLinks("file src/a.ts then https://x.com");
    expect(spans.map((s) => s.kind)).toEqual(["file", "url"]);
  });

  it("does not double-match a path inside a url", () => {
    const spans = detectLinks("https://host.com/path/to/file.ts done");
    expect(spans).toHaveLength(1);
    expect(spans[0]!.kind).toBe("url");
  });
});

describe("resolveLinkTarget", () => {
  it("resolves a url span to a browser open", () => {
    const [span] = detectLinks("go https://example.com");
    expect(resolveLinkTarget(span!)).toEqual({ open: "browser", url: "https://example.com" });
  });

  it("resolves a file:line span to an editor open with the parsed line", () => {
    const [span] = detectLinks("at src/agent.ts:42 here");
    expect(resolveLinkTarget(span!)).toEqual({ open: "editor", file: "src/agent.ts", line: 42 });
  });

  it("resolves a bare file span to line 1", () => {
    const [span] = detectLinks("open src/agent.ts now");
    expect(resolveLinkTarget(span!)).toEqual({ open: "editor", file: "src/agent.ts", line: 1 });
  });
});
