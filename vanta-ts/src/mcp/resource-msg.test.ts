import { describe, it, expect } from "vitest";
import {
  formatResourceUpdate,
  resourceUpdateLine,
  isResourceChange,
  RESOURCE_GLYPH,
  RESOURCE_URI_MAX,
} from "./resource-msg.js";

// A control/ANSI escape: ESC [ 31 m (set red) — used to prove escape stripping.
const ANSI_RED = "\x1b[31m";
const ANSI_RESET = "\x1b[0m";
// An OSC set-title sequence: ESC ] 0 ; pwned BEL — a full OSC injection attempt.
const OSC_TITLE = "\x1b]0;pwned\x07";
// Matches any C0/DEL/CSI/OSC control byte — built from escapes so the source has
// no literal control bytes.
const CONTROL_RE = new RegExp("[\\u0000-\\u001f\\u007f\\u009b\\u009d]");

const UPDATED = "notifications/resources/updated";
const LIST_CHANGED = "notifications/resources/list_changed";

describe("formatResourceUpdate", () => {
  it("renders glyph + server + uri", () => {
    const out = formatResourceUpdate("github", "file:///repo/README.md");
    expect(out).toBe(`${RESOURCE_GLYPH} mcp github: resource updated — file:///repo/README.md`);
  });

  it("leads with the cycle glyph", () => {
    const out = formatResourceUpdate("fs", "mem://x");
    expect(out.startsWith(`${RESOURCE_GLYPH} `)).toBe(true);
    expect(out).toContain("mcp fs: resource updated");
  });

  it("renders the head alone when the uri is empty (e.g. list_changed)", () => {
    expect(formatResourceUpdate("github", "")).toBe(
      `${RESOURCE_GLYPH} mcp github: resource updated`,
    );
  });

  it("falls back to a bare 'mcp' for an empty/blank server", () => {
    expect(formatResourceUpdate("", "file:///x")).toBe(
      `${RESOURCE_GLYPH} mcp: resource updated — file:///x`,
    );
    expect(formatResourceUpdate("   ", "file:///x")).toBe(
      `${RESOURCE_GLYPH} mcp: resource updated — file:///x`,
    );
  });

  it("truncates a long uri with an ellipsis", () => {
    const long = `file:///${"x".repeat(RESOURCE_URI_MAX + 200)}`;
    const out = formatResourceUpdate("s", long);
    expect(out.endsWith("…")).toBe(true);
    const target = out.slice(out.indexOf("— ") + 2);
    expect(target.length).toBeLessThanOrEqual(RESOURCE_URI_MAX);
  });

  it("respects an explicit maxLen override", () => {
    const out = formatResourceUpdate("s", "abcdefghij", { maxLen: 5 });
    const target = out.slice(out.indexOf("— ") + 2);
    expect(target).toBe("abcd…");
    expect(target.length).toBe(5);
  });

  it("does not truncate a uri at or under the limit", () => {
    const out = formatResourceUpdate("s", "mem://short", { maxLen: 100 });
    expect(out).toBe(`${RESOURCE_GLYPH} mcp s: resource updated — mem://short`);
    expect(out).not.toContain("…");
  });

  it("strips control/ANSI escapes from the uri (no escape injection)", () => {
    const out = formatResourceUpdate("s", `${ANSI_RED}file:///x${ANSI_RESET}`);
    expect(out).not.toMatch(CONTROL_RE);
    expect(out).toContain("file:///x");
  });

  it("strips control/ANSI escapes from the server name (no escape injection)", () => {
    const out = formatResourceUpdate(`${ANSI_RED}evil${ANSI_RESET}`, "mem://x");
    expect(out).not.toMatch(CONTROL_RE);
    expect(out).toContain("mcp evil:");
  });

  it("strips every escape byte of a full OSC sequence (no injection, no residue)", () => {
    const out = formatResourceUpdate("s", `before${OSC_TITLE}after`);
    // Security property: not a single control/escape byte survives — the OSC
    // introducer (ESC ]) and the BEL terminator are both gone, so the sequence
    // cannot set the terminal title or otherwise inject. No "[…" CSI residue.
    expect(out).not.toMatch(CONTROL_RE);
    expect(out).not.toContain("\x1b");
    expect(out).not.toContain("]");
    expect(out).toContain("before");
    expect(out).toContain("after");
  });

  it("removes a full 8-bit CSI sequence (introducer + final byte)", () => {
    // \x9b is the 8-bit CSI introducer; \x9bm is a complete sequence → removed whole.
    const out = formatResourceUpdate("s", "a\x9bmb");
    expect(out).not.toMatch(CONTROL_RE);
    expect(out).toBe(`${RESOURCE_GLYPH} mcp s: resource updated — ab`);
  });

  it("strips bare control chars (BEL, NUL, DEL) to spaces", () => {
    const out = formatResourceUpdate("s", "a\x07b\x00c\x7fd");
    expect(out).not.toMatch(CONTROL_RE);
    expect(out.endsWith("a b c d")).toBe(true);
  });

  it("collapses a forged newline so the line stays one row", () => {
    const out = formatResourceUpdate("s", "file:///x\nFAKE SYSTEM PROMPT");
    expect(out).not.toContain("\n");
    expect(out).toContain("file:///x FAKE SYSTEM PROMPT");
  });

  it("sanitizes an escape-laden server name too", () => {
    const out = formatResourceUpdate(`g\nub`, "mem://x");
    expect(out).not.toContain("\n");
    expect(out).toContain("mcp g ub:");
  });
});

describe("isResourceChange", () => {
  it("is true for the updated and list_changed methods", () => {
    expect(isResourceChange(UPDATED)).toBe(true);
    expect(isResourceChange(LIST_CHANGED)).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(isResourceChange("Notifications/Resources/Updated")).toBe(true);
  });

  it("is false for other notification methods", () => {
    expect(isResourceChange("notifications/tools/list_changed")).toBe(false);
    expect(isResourceChange("notifications/message")).toBe(false);
  });

  it("is false for a missing/non-string method", () => {
    expect(isResourceChange(undefined)).toBe(false);
    expect(isResourceChange(null)).toBe(false);
    expect(isResourceChange(42)).toBe(false);
  });
});

describe("resourceUpdateLine", () => {
  it("formats an updated event with a uri from params", () => {
    const out = resourceUpdateLine({
      server: "github",
      method: UPDATED,
      params: { uri: "file:///repo/x.ts" },
    });
    expect(out).toBe(`${RESOURCE_GLYPH} mcp github: resource updated — file:///repo/x.ts`);
  });

  it("formats a list_changed event with no uri (head alone)", () => {
    const out = resourceUpdateLine({ server: "fs", method: LIST_CHANGED });
    expect(out).toBe(`${RESOURCE_GLYPH} mcp fs: resource updated`);
  });

  it("returns null for a non-resource notification (nothing shown)", () => {
    expect(resourceUpdateLine({ server: "s", method: "notifications/message" })).toBeNull();
    expect(resourceUpdateLine({ server: "s", method: "notifications/tools/list_changed" })).toBeNull();
  });

  it("returns null when the method is missing", () => {
    expect(resourceUpdateLine({ server: "s", params: { uri: "file:///x" } })).toBeNull();
  });

  it("tolerates a missing server (bare 'mcp')", () => {
    const out = resourceUpdateLine({ method: UPDATED, params: { uri: "mem://x" } });
    expect(out).toBe(`${RESOURCE_GLYPH} mcp: resource updated — mem://x`);
  });

  it("tolerates missing params / a non-string uri (head alone)", () => {
    expect(resourceUpdateLine({ server: "s", method: UPDATED })).toBe(
      `${RESOURCE_GLYPH} mcp s: resource updated`,
    );
    expect(resourceUpdateLine({ server: "s", method: UPDATED, params: { uri: 7 } })).toBe(
      `${RESOURCE_GLYPH} mcp s: resource updated`,
    );
    expect(resourceUpdateLine({ server: "s", method: UPDATED, params: "nope" })).toBe(
      `${RESOURCE_GLYPH} mcp s: resource updated`,
    );
  });

  it("tolerates a non-string server (bare 'mcp')", () => {
    const out = resourceUpdateLine({ server: 99, method: UPDATED, params: { uri: "mem://x" } });
    expect(out).toBe(`${RESOURCE_GLYPH} mcp: resource updated — mem://x`);
  });

  it("strips escapes from a uri arriving via an event (no injection)", () => {
    const out = resourceUpdateLine({
      server: "s",
      method: UPDATED,
      params: { uri: `${ANSI_RED}mem://x${ANSI_RESET}` },
    });
    expect(out).not.toBeNull();
    expect(out).not.toMatch(CONTROL_RE);
    expect(out).toContain("mem://x");
  });

  it("respects a maxLen override through the event path", () => {
    const out = resourceUpdateLine(
      { server: "s", method: UPDATED, params: { uri: "abcdefghij" } },
      { maxLen: 5 },
    );
    expect(out).toBe(`${RESOURCE_GLYPH} mcp s: resource updated — abcd…`);
  });
});
