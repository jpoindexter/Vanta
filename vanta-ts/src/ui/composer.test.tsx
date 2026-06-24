import { createElement as h } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderUi, tick, waitUntil, waitForFrame } from "./test-render.js";
import { countLines, Composer, ComposerView, PASTE_PILL_THRESHOLD, isImagePasteSignal, normalizePaste } from "./composer.js";
import { matchSlash } from "./slash.js";
import type { SlackChannel } from "../repl/slack-suggest.js";

describe("countLines — pure helper", () => {
  it("returns 0 for empty string", () => expect(countLines("")).toBe(0));
  it("returns 1 for single-line text", () => expect(countLines("hello world")).toBe(1));
  it("returns 2 for one newline", () => expect(countLines("line1\nline2")).toBe(2));
  it("returns N+1 for N newlines", () => expect(countLines("a\nb\nc\nd")).toBe(4));
});

describe("PASTE_PILL_THRESHOLD", () => {
  it("is 3 so content with 4+ lines triggers the pill", () => expect(PASTE_PILL_THRESHOLD).toBe(3));
});

describe("isImagePasteSignal — empty paste means a non-text (image) clipboard", () => {
  it("true for an empty paste (raw image, no text representation)", () => expect(isImagePasteSignal("")).toBe(true));
  it("true for whitespace-only (some terminals pad the empty bracketed paste)", () => {
    expect(isImagePasteSignal("   ")).toBe(true);
    expect(isImagePasteSignal("\n")).toBe(true);
  });
  it("false for real pasted text (must insert, not grab an image)", () => {
    expect(isImagePasteSignal("hello")).toBe(false);
    expect(isImagePasteSignal("/tmp/x.png")).toBe(false);
  });
});

const baseView = (overrides: Partial<Parameters<typeof ComposerView>[0]> = {}) =>
  h(ComposerView, {
    slashMatches: [],
    atMatches: [],
    sel: 0,
    value: "hello",
    cursor: 5,
    placeholder: "Type a message…",
    ...overrides,
  });

describe("ComposerView — paste pill", () => {
  it("renders CursorText content when no pill", async () => {
    const inst = renderUi(baseView({ value: "hello", cursor: 5 }));
    await tick();
    expect(inst.lastFrame()).toContain("hello");
    expect(inst.lastFrame()).not.toContain("Pasted text");
    inst.unmount();
  });

  it("renders the pill label when pill prop is set", async () => {
    const inst = renderUi(baseView({
      value: "line1\nline2\nline3\nline4",
      cursor: 0,
      pill: { count: 1, lines: 4 },
    }));
    await tick();
    const frame = inst.lastFrame() ?? "";
    expect(frame).toContain("Pasted text #1 +4 lines");
    expect(frame).not.toContain("line1");
    inst.unmount();
  });

  it("increments count in the pill label", async () => {
    const inst = renderUi(baseView({
      value: "a\nb\nc\nd\ne",
      cursor: 0,
      pill: { count: 3, lines: 5 },
    }));
    await tick();
    expect(inst.lastFrame()).toContain("Pasted text #3 +5 lines");
    inst.unmount();
  });
});

describe("Composer — long paste collapses to a pill even with newlines stripped", () => {
  it("pills a long single-line paste (≤3 lines) via the char threshold", async () => {
    const inst = renderUi(h(Composer, { focused: true, onSubmit: () => {}, placeholder: "Ask", files: [], history: [] }));
    await tick();
    const longPaste = "word ".repeat(140); // ~700 chars, ONE line (newlines stripped) — used to wrap/scramble
    inst.input(longPaste);
    await waitForFrame(inst, "Pasted text");
    expect(inst.lastFrame()).not.toContain("word word word"); // raw text collapsed, not rendered as a scramble
    inst.unmount();
  });

  it("does NOT pill ordinary short typed input", async () => {
    const inst = renderUi(h(Composer, { focused: true, onSubmit: () => {}, placeholder: "Ask", files: [], history: [] }));
    await tick();
    inst.input("a normal short message");
    await waitForFrame(inst, "a normal short message");
    expect(inst.lastFrame()).not.toContain("Pasted text");
    inst.unmount();
  });
});

describe("Composer focus handling", () => {
  it("does not insert printable keys when the composer is not focused", async () => {
    const inst = renderUi(h(Composer, { focused: false, onSubmit: () => {}, placeholder: "Ask", files: [], history: [] }));
    await tick();
    inst.input("x");
    await tick();
    expect(inst.lastFrame()).not.toContain("x");
    inst.unmount();
  });

  it("keeps slash palette arrow and Enter behavior when focused", async () => {
    const onSubmit = vi.fn();
    const inst = renderUi(h(Composer, { focused: true, onSubmit, placeholder: "Ask", files: [], history: [] }));
    await tick();
    inst.input("/mo");
    await tick();
    inst.input("\x1b[B");
    await tick();
    inst.input("\r");
    await tick();
    expect(onSubmit).toHaveBeenCalledWith(`/${matchSlash("/mo")[1]!.name}`);
    inst.unmount();
  });
});

// The real-Ink input parser holds a chunk for ~20ms before emitting (escape
// disambiguation), so each keypress needs a few 10ms ticks to flush. Frame text
// is unreliable through the concatenated capture, so vi behavior is asserted via
// onSubmit; the visible NOR/INS tag is covered by the ComposerView render tests.
const ticks = async (n: number): Promise<void> => { for (let i = 0; i < n; i++) await tick(); };

describe("Composer vi-mode behavior", () => {
  it("starts in normal mode: typed letters are not inserted and Enter does not submit", async () => {
    const onSubmit = vi.fn();
    const inst = renderUi(h(Composer, { focused: true, vim: true, onSubmit, placeholder: "Ask", files: [], history: [] }));
    await tick();
    inst.input("hello"); await ticks(3);
    inst.input("\r"); await ticks(3); // Enter is consumed by normal mode — no submit
    expect(onSubmit).not.toHaveBeenCalled();
    inst.unmount();
  });

  it("i enters insert mode; typing then Enter submits the typed text", async () => {
    const onSubmit = vi.fn();
    const inst = renderUi(h(Composer, { focused: true, vim: true, onSubmit, placeholder: "Ask", files: [], history: [] }));
    await tick();
    inst.input("i"); await ticks(3); // enter insert
    inst.input("hello"); await ticks(3);
    inst.input("\r"); await waitUntil(() => onSubmit.mock.calls.length > 0);
    expect(onSubmit).toHaveBeenCalledWith("hello");
    inst.unmount();
  });

  it("Esc leaves insert mode so subsequent letters stop inserting", async () => {
    const onSubmit = vi.fn();
    const inst = renderUi(h(Composer, { focused: true, vim: true, onSubmit, placeholder: "Ask", files: [], history: [] }));
    await tick();
    inst.input("i"); await ticks(3);
    inst.input("hi"); await ticks(3);
    inst.input("\x1b"); await ticks(3); // Esc → normal
    inst.input("xyz"); await ticks(3); // dropped in normal mode
    inst.input("i"); await ticks(3); // back to insert at cursor (within "hi")
    inst.input("\r"); await waitUntil(() => onSubmit.mock.calls.length > 0);
    expect(onSubmit).toHaveBeenCalledWith("hi"); // xyz never entered the buffer
    inst.unmount();
  });

  it("does not intercept keys when vim is off (normal typing submits)", async () => {
    const onSubmit = vi.fn();
    const inst = renderUi(h(Composer, { focused: true, onSubmit, placeholder: "Ask", files: [], history: [] }));
    await tick();
    inst.input("hello"); await ticks(3);
    inst.input("\r"); await waitUntil(() => onSubmit.mock.calls.length > 0);
    expect(onSubmit).toHaveBeenCalledWith("hello");
    inst.unmount();
  });
});

describe("ComposerView vi-mode tag", () => {
  it("renders NOR in normal mode", async () => {
    const inst = renderUi(baseView({ vimMode: "normal" }));
    await tick();
    expect(inst.lastFrame()).toContain("NOR");
    inst.unmount();
  });
  it("renders INS in insert mode", async () => {
    const inst = renderUi(baseView({ vimMode: "insert" }));
    await tick();
    expect(inst.lastFrame()).toContain("INS");
    inst.unmount();
  });
  it("renders no tag when vimMode is undefined", async () => {
    const inst = renderUi(baseView({}));
    await tick();
    const frame = inst.lastFrame() ?? "";
    expect(frame).not.toContain("NOR");
    expect(frame).not.toContain("INS");
    inst.unmount();
  });
});

describe("ComposerView — #channel palette", () => {
  it("renders the channel suggestions when channelMatches is set", async () => {
    const inst = renderUi(baseView({ channelMatches: ["#general", "#genie"], value: "#gen", cursor: 4 }));
    await waitForFrame(inst, "#general");
    expect(inst.lastFrame()).toContain("#genie");
    inst.unmount();
  });

  it("renders no channel palette when channelMatches is empty", async () => {
    const inst = renderUi(baseView({ channelMatches: [], value: "hello", cursor: 5 }));
    await tick();
    expect(inst.lastFrame()).not.toContain("#general");
    inst.unmount();
  });
});

const SLACK_CHANNELS: SlackChannel[] = [
  { id: "C1", name: "general", isMember: true },
  { id: "C2", name: "genie", isMember: false },
];

describe("Composer #channel completion (live wire)", () => {
  it("surfaces channel suggestions while typing a #-fragment", async () => {
    const inst = renderUi(h(Composer, {
      focused: true, onSubmit: () => {}, placeholder: "Ask", files: [], history: [], channels: SLACK_CHANNELS,
    }));
    await tick();
    inst.input("#gen");
    // "general" (member, prefix) ranks first; the palette shows the #-label.
    await waitForFrame(inst, "#general");
    expect(inst.lastFrame()).toContain("#genie");
    inst.unmount();
  });

  it("Tab completes the #-fragment to the top-ranked channel", async () => {
    const onSubmit = vi.fn();
    const inst = renderUi(h(Composer, {
      focused: true, onSubmit, placeholder: "Ask", files: [], history: [], channels: SLACK_CHANNELS,
    }));
    await tick();
    inst.input("#gen");
    await waitForFrame(inst, "#general");
    inst.input("\t"); // Tab → complete to the selected (top) channel
    await waitForFrame(inst, "general");
    inst.input("\r"); // submit
    await waitUntil(() => onSubmit.mock.calls.length > 0);
    expect(onSubmit).toHaveBeenCalledWith("#general");
    inst.unmount();
  });

  it("opens no channel palette without a #-fragment", async () => {
    const inst = renderUi(h(Composer, {
      focused: true, onSubmit: () => {}, placeholder: "Ask", files: [], history: [], channels: SLACK_CHANNELS,
    }));
    await tick();
    inst.input("hello");
    await waitForFrame(inst, "hello");
    expect(inst.lastFrame()).not.toContain("#general");
    inst.unmount();
  });
});

describe("Composer — race-safe input (paste arriving as rapid chunks)", () => {
  it("does not drop the first chunk when two inputs land in one tick", async () => {
    const inst = renderUi(h(Composer, { focused: true, onSubmit: () => {}, placeholder: "Ask", files: [], history: [] }));
    await tick();
    // Two chunks with NO await between them — the stale-closure bug would compute
    // the second from value="" and drop the first; the synchronous refs prevent it.
    inst.input("first-chunk-");
    inst.input("second-chunk");
    await waitForFrame(inst, "first-chunk-second-chunk");
    inst.unmount();
  });
});

describe("Composer — paste-burst guard (newline mid-paste must not submit)", () => {
  beforeEach(() => { process.env.VANTA_PASTE_BURST_MS = "6"; }); // opt-in for these cases
  afterEach(() => { delete process.env.VANTA_PASTE_BURST_MS; });

  it("does NOT submit on a newline that arrives in a rapid burst (a paste)", async () => {
    const onSubmit = vi.fn();
    const inst = renderUi(h(Composer, { focused: true, onSubmit, placeholder: "Ask", files: [], history: [] }));
    await tick();
    // text then \r then more, all back-to-back (no await) = a paste burst.
    inst.input("line one");
    inst.input("\r");
    inst.input("line two");
    await tick();
    expect(onSubmit).not.toHaveBeenCalled(); // did not submit mid-paste
    inst.unmount();
  });

  it("DOES submit on an isolated Enter after a human-speed gap", async () => {
    const onSubmit = vi.fn();
    const inst = renderUi(h(Composer, { focused: true, onSubmit, placeholder: "Ask", files: [], history: [] }));
    await tick();
    inst.input("hello");
    await tick(); // 10ms gap > the 6ms burst threshold
    inst.input("\r");
    await waitUntil(() => onSubmit.mock.calls.length > 0);
    expect(onSubmit).toHaveBeenCalledWith("hello");
    inst.unmount();
  });
});

describe("normalizePaste — carriage returns never enter the buffer", () => {
  it("converts CRLF and lone CR to LF", () => {
    expect(normalizePaste("a\r\nb\rc")).toBe("a\nb\nc");
    expect(normalizePaste("line1\r\nline2\r\nline3")).toBe("line1\nline2\nline3");
    expect(normalizePaste("no carriage returns here")).toBe("no carriage returns here");
  });

  it("a lone-CR bracketed paste pills instead of scrambling (CR→LF makes the lines countable)", async () => {
    const onSubmit = vi.fn();
    const inst = renderUi(h(Composer, { focused: true, onSubmit, placeholder: "Ask", files: [], history: [] }));
    await tick();
    // Old-mac / clipboard CR endings: without normalization countLines sees 1 line and
    // the raw CRs overwrite the render. Normalized → 5 LF lines → pill, no submit.
    inst.input("\x1b[200~one\rtwo\rthree\rfour\rfive\x1b[201~");
    await waitForFrame(inst, "Pasted text");
    expect(onSubmit).not.toHaveBeenCalled();
    inst.unmount();
  });
});

describe("Composer — raw (non-bracketed) multi-line paste chunk", () => {
  it("normalizes a raw chunk with CRs and does not submit mid-paste", async () => {
    const onSubmit = vi.fn();
    const inst = renderUi(h(Composer, { focused: true, onSubmit, placeholder: "Ask", files: [], history: [] }));
    await tick();
    // A multi-char input containing CRs (raw paste, bracketed paste off) — must be
    // inserted (normalized), never treated as Enter.
    inst.input("alpha\rbravo\rcharlie\rdelta\recho");
    await waitForFrame(inst, "Pasted text");
    expect(onSubmit).not.toHaveBeenCalled();
    inst.unmount();
  });
});
