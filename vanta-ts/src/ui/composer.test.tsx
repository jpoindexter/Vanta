import { createElement as h } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { countLines, Composer, ComposerView, PASTE_PILL_THRESHOLD } from "./composer.js";
import { matchSlash } from "./slash.js";

describe("countLines — pure helper", () => {
  it("returns 0 for empty string", () => expect(countLines("")).toBe(0));
  it("returns 1 for single-line text", () => expect(countLines("hello world")).toBe(1));
  it("returns 2 for one newline", () => expect(countLines("line1\nline2")).toBe(2));
  it("returns N+1 for N newlines", () => expect(countLines("a\nb\nc\nd")).toBe(4));
});

describe("PASTE_PILL_THRESHOLD", () => {
  it("is 3 so content with 4+ lines triggers the pill", () => expect(PASTE_PILL_THRESHOLD).toBe(3));
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
    inst.input("\r"); await ticks(3);
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
    inst.input("\r"); await ticks(3);
    expect(onSubmit).toHaveBeenCalledWith("hi"); // xyz never entered the buffer
    inst.unmount();
  });

  it("does not intercept keys when vim is off (normal typing submits)", async () => {
    const onSubmit = vi.fn();
    const inst = renderUi(h(Composer, { focused: true, onSubmit, placeholder: "Ask", files: [], history: [] }));
    await tick();
    inst.input("hello"); await ticks(3);
    inst.input("\r"); await ticks(3);
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
