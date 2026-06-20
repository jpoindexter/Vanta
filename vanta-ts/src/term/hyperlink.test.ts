import { describe, it, expect } from "vitest";
import { osc8Link, sanitizeLinkUrl, hyperlinksEnabled, linkOr, fileLink } from "./hyperlink.js";

const OSC = "\x1b]8;;";
const ST = "\x1b\\";
const env = (o: Record<string, string | undefined>): NodeJS.ProcessEnv => o as NodeJS.ProcessEnv;
const on = (o: Record<string, string | undefined> = {}): NodeJS.ProcessEnv =>
  ({ VANTA_HYPERLINKS: "1", ...o }) as NodeJS.ProcessEnv;
const off = (): NodeJS.ProcessEnv => ({ VANTA_HYPERLINKS: "0" }) as NodeJS.ProcessEnv;

/** Count opener (`ESC]8;;`) occurrences in a string — there must be exactly 2
 *  (the link opener + the empty closer) for a well-formed single OSC-8 link. */
function openerCount(s: string): number {
  return s.split(OSC).length - 1;
}

describe("osc8Link", () => {
  it("wraps url + label in the exact OSC-8 form", () => {
    const out = osc8Link("https://example.com", "example.com");
    expect(out).toBe(`${OSC}https://example.com${ST}example.com${OSC}${ST}`);
  });

  it("displays the label, not the url, as the visible text", () => {
    const out = osc8Link("https://example.com/very/long/target", "click here");
    // strip the escape bytes → only the label remains visible
    const visible = out.replaceAll(OSC, "").replaceAll(ST, "").replace("https://example.com/very/long/target", "");
    expect(visible).toBe("click here");
  });

  it("produces exactly one opener+closer pair even from a clean url", () => {
    expect(openerCount(osc8Link("https://x.com", "x"))).toBe(2);
  });
});

describe("sanitizeLinkUrl", () => {
  it("returns '' for an empty url", () => {
    expect(sanitizeLinkUrl("")).toBe("");
  });

  it("returns '' for a url that is entirely control chars", () => {
    expect(sanitizeLinkUrl("\x1b\x07\x00\x9f")).toBe("");
  });

  it("strips an embedded ESC so an ST (ESC \\) cannot be injected", () => {
    // hostile: try to close the link early and open a second one
    const hostile = "https://x.com\x1b\\evil\x1b]8;;https://attacker.test";
    const clean = sanitizeLinkUrl(hostile);
    expect(clean).not.toContain("\x1b");
    // the ESC of the ST is gone, so the lone `\` and `]8;;` survive as inert text
    expect(clean).toBe("https://x.com\\evil]8;;https://attacker.test");
  });

  it("strips BEL, DEL, and C1 controls", () => {
    expect(sanitizeLinkUrl("a\x07b\x7fc\x80d")).toBe("abcd");
  });

  it("leaves an ordinary url untouched", () => {
    expect(sanitizeLinkUrl("https://example.com/a?b=1&c=2#frag")).toBe(
      "https://example.com/a?b=1&c=2#frag",
    );
  });
});

describe("osc8Link — breakout neutralization (SECURITY)", () => {
  it("a hostile url with an embedded ESC \\ yields exactly one opener + one closer", () => {
    const hostile = "https://x.com\x1b\\X\x1b]8;;https://attacker.test\x1b\\";
    const out = osc8Link(hostile, "label");
    // No raw ESC survives from the url, so the only ESC bytes are the ones we add.
    // A well-formed single link has exactly two `ESC]8;;` openers and the bytes
    // between them are the (now inert) url. Injection is impossible.
    expect(openerCount(out)).toBe(2);
    expect(out.startsWith(OSC)).toBe(true);
    expect(out.endsWith(`${OSC}${ST}`)).toBe(true);
    // the attacker's ST/opener are now plain text inside the url slot
    expect(out).toContain("https://x.com\\X]8;;https://attacker.test");
  });

  it("a url that is just an ST cannot terminate the sequence early", () => {
    // The ESC of the ST is stripped, leaving an inert backslash in the url slot —
    // so the sequence still has exactly one opener + one closer (no early break).
    const out = osc8Link("\x1b\\", "label");
    // url slot is the inert backslash; the only ST before the label is OUR opener's.
    expect(out).toBe(`${OSC}\\${ST}label${OSC}${ST}`);
    expect(openerCount(out)).toBe(2);
  });
});

describe("hyperlinksEnabled", () => {
  it("is off by default (no env signal)", () => {
    expect(hyperlinksEnabled(env({}))).toBe(false);
  });

  it("is on with VANTA_HYPERLINKS=1 / true", () => {
    expect(hyperlinksEnabled(env({ VANTA_HYPERLINKS: "1" }))).toBe(true);
    expect(hyperlinksEnabled(env({ VANTA_HYPERLINKS: "true" }))).toBe(true);
  });

  it("VANTA_HYPERLINKS=0 / false forces off even on a known terminal", () => {
    expect(hyperlinksEnabled(env({ VANTA_HYPERLINKS: "0", TERM_PROGRAM: "iTerm.app" }))).toBe(false);
    expect(hyperlinksEnabled(env({ VANTA_HYPERLINKS: "false", TERM_PROGRAM: "WezTerm" }))).toBe(false);
  });

  it("detects a known-good TERM_PROGRAM", () => {
    for (const p of ["iTerm.app", "WezTerm", "vscode", "ghostty"]) {
      expect(hyperlinksEnabled(env({ TERM_PROGRAM: p }))).toBe(true);
    }
  });

  it("is off for an unknown TERM_PROGRAM (garbage-prevention default)", () => {
    expect(hyperlinksEnabled(env({ TERM_PROGRAM: "Apple_Terminal" }))).toBe(false);
  });
});

describe("linkOr", () => {
  it("returns the OSC-8 link when enabled and the url is safe", () => {
    expect(linkOr("https://example.com", "example.com", on())).toBe(
      `${OSC}https://example.com${ST}example.com${OSC}${ST}`,
    );
  });

  it("returns the plain label when disabled (current behavior)", () => {
    expect(linkOr("https://example.com", "example.com", off())).toBe("example.com");
  });

  it("returns the plain label when the url is empty", () => {
    expect(linkOr("", "label", on())).toBe("label");
  });

  it("returns the plain label when the url sanitizes to empty (all control chars)", () => {
    expect(linkOr("\x1b\x07\x00", "label", on())).toBe("label");
  });

  it("sanitizes a hostile url before linking — no breakout", () => {
    const out = linkOr("https://x.com\x1b\\\x1b]8;;evil", "label", on());
    expect(out).not.toContain("\x1b]8;;evil".slice(0, 5) + "evil"); // no second real opener
    expect(openerCount(out)).toBe(2);
  });
});

describe("fileLink", () => {
  it("builds a file:// link for an absolute path when enabled", () => {
    expect(fileLink("/abs/b.ts", on())).toBe(`${OSC}file:///abs/b.ts${ST}/abs/b.ts${OSC}${ST}`);
  });

  it("resolves a relative path against cwd", () => {
    expect(fileLink("src/a.ts", on(), "/repo")).toBe(
      `${OSC}file:///repo/src/a.ts${ST}src/a.ts${OSC}${ST}`,
    );
  });

  it("uses the path as the visible label", () => {
    const out = fileLink("/abs/b.ts", on());
    const visible = out.replaceAll(OSC, "").replaceAll(ST, "").replace("file:///abs/b.ts", "");
    expect(visible).toBe("/abs/b.ts");
  });

  it("returns the plain path when disabled", () => {
    expect(fileLink("/abs/b.ts", off())).toBe("/abs/b.ts");
  });

  it("returns '' for an empty path", () => {
    expect(fileLink("", on())).toBe("");
  });
});
