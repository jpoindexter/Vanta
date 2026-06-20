import { describe, it, expect } from "vitest";
import { linkify } from "./linkify.js";

const OSC = "\x1b]8;;";
const ST = "\x1b\\";

// VANTA_HYPERLINKS=1 forces support regardless of TTY (see osc8.supportsHyperlinks),
// so these stay pure — no process.stdout.isTTY dependency.
const on = (o: Record<string, string | undefined> = {}): NodeJS.ProcessEnv =>
  ({ VANTA_HYPERLINKS: "1", ...o }) as NodeJS.ProcessEnv;
const off = (): NodeJS.ProcessEnv => ({ VANTA_HYPERLINKS: "0" }) as NodeJS.ProcessEnv;

describe("linkify — supported terminal", () => {
  it("wraps a url in the OSC-8 escape with the url as the target", () => {
    const out = linkify("see https://example.com now", on(), "/repo");
    expect(out).toContain(`${OSC}https://example.com${ST}https://example.com${OSC}${ST}`);
    expect(out).toContain("see ");
    expect(out).toContain(" now");
  });

  it("wraps a relative file:line ref as an editor deep link", () => {
    const out = linkify("at src/a.ts:42 here", on({ VANTA_EDITOR: "code" }), "/repo");
    expect(out).toContain(`${OSC}vscode://file/repo/src/a.ts:42${ST}src/a.ts:42${OSC}${ST}`);
  });

  it("wraps an absolute path with a file:// url for a non-deep-link editor", () => {
    const out = linkify("open /abs/b.ts", on({ VANTA_EDITOR: "vim" }), "/repo");
    expect(out).toContain(`${OSC}file:///abs/b.ts${ST}/abs/b.ts${OSC}${ST}`);
  });

  it("detects both a url and a file:line in the same line", () => {
    const out = linkify("https://x.com and src/a.ts:9", on({ VANTA_EDITOR: "vim" }), "/repo");
    expect(out).toContain(`${OSC}https://x.com${ST}https://x.com`);
    // file:// urls aren't line-aware: href drops the line, label keeps it.
    expect(out).toContain(`${OSC}file:///repo/src/a.ts${ST}src/a.ts:9`);
  });

  it("leaves a line with no links unchanged (no escape bytes)", () => {
    const out = linkify("just some plain prose", on(), "/repo");
    expect(out).toBe("just some plain prose");
    expect(out).not.toContain(OSC);
  });
});

describe("linkify — unsupported terminal", () => {
  it("returns the text unchanged with no OSC-8 bytes", () => {
    const text = "see https://example.com and src/a.ts:10";
    const out = linkify(text, off(), "/repo");
    expect(out).toBe(text);
    expect(out).not.toContain(OSC);
  });
});

describe("linkify — code fences", () => {
  it("never wraps a url or path inside a ``` fenced block", () => {
    const text = "click https://x.com\n```\ncurl https://x.com src/a.ts:1\n```\nthen src/b.ts:2";
    const out = linkify(text, on({ VANTA_EDITOR: "vim" }), "/repo");
    const lines = out.split("\n");
    // Outside the fence: linked (file:// href drops the line, label keeps it).
    expect(lines[0]).toContain(`${OSC}https://x.com${ST}`);
    expect(lines[4]).toContain(`${OSC}file:///repo/src/b.ts${ST}src/b.ts:2`);
    // Inside the fence: untouched, literal.
    expect(lines[2]).toBe("curl https://x.com src/a.ts:1");
    expect(lines[2]).not.toContain(OSC);
  });

  it("treats the fence delimiter lines as plain (never a link)", () => {
    const out = linkify("```ts\nconst x = 1\n```", on(), "/repo");
    expect(out).toBe("```ts\nconst x = 1\n```");
    expect(out).not.toContain(OSC);
  });

  it("handles an unterminated fence by skipping to end of text", () => {
    const out = linkify("intro\n```\nhttps://x.com\nsrc/a.ts:3", on(), "/repo");
    const lines = out.split("\n");
    expect(lines[2]).toBe("https://x.com");
    expect(lines[3]).toBe("src/a.ts:3");
    expect(out).not.toContain(OSC);
  });
});
