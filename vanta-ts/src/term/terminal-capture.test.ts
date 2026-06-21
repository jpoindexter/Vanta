import { describe, it, expect } from "vitest";
import {
  processCapture,
  captureToSnapshot,
  emptyCapturePanelState,
  toggleCapturePanel,
  captureEnabled,
} from "./terminal-capture.js";

// ESC = \x1b. CSI = ESC [ ... final. OSC = ESC ] ... BEL|ST.
const ESC = "\x1b";
const BEL = "\x07";

describe("processCapture — ANSI/control stripping (security)", () => {
  it("strips a CSI color sequence, keeping the text", () => {
    const raw = `${ESC}[31mred${ESC}[0m text`;
    expect(processCapture(raw)).toBe("red text");
  });

  it("strips an OSC sequence (title set) so it can't inject control codes", () => {
    const raw = `${ESC}]0;evil title${BEL}safe output`;
    expect(processCapture(raw)).toBe("safe output");
  });

  it("strips a bare ESC + single-char escape, not just the ESC byte", () => {
    const raw = `before${ESC}Mafter`; // ESC M = reverse line feed
    expect(processCapture(raw)).toBe("beforeafter");
  });

  it("leaves NO escape bytes in the snapshot for a buffer of mixed sequences", () => {
    const raw = `${ESC}[2J${ESC}[H${ESC}]0;t${BEL}line1\n${ESC}[1;32mline2${ESC}[0m`;
    const out = processCapture(raw);
    expect(out).toBe("line1\nline2");
    expect(out).not.toContain(ESC);
    expect(out).not.toContain("[");
    expect(out).not.toContain(BEL);
  });

  it("strips C0 control chars (e.g. \\x00) while keeping newlines", () => {
    const raw = "a\x00b\nc\x01d";
    expect(processCapture(raw)).toBe("ab\ncd");
  });
});

describe("processCapture — line shaping", () => {
  it("keeps newlines between lines", () => {
    expect(processCapture("one\ntwo\nthree")).toBe("one\ntwo\nthree");
  });

  it("normalizes \\r\\n to \\n", () => {
    expect(processCapture("one\r\ntwo")).toBe("one\ntwo");
  });

  it("trims trailing whitespace per line", () => {
    expect(processCapture("a   \nb\t\t")).toBe("a\nb");
  });

  it("collapses trailing blank lines but keeps interior blanks", () => {
    expect(processCapture("a\n\nb\n\n\n")).toBe("a\n\nb");
  });

  it("clips to the LAST maxLines lines", () => {
    const raw = Array.from({ length: 10 }, (_, i) => `line${i}`).join("\n");
    expect(processCapture(raw, { maxLines: 3 })).toBe("line7\nline8\nline9");
  });

  it("does not clip when under maxLines", () => {
    expect(processCapture("a\nb", { maxLines: 200 })).toBe("a\nb");
  });

  it("falls back to the default cap when maxLines is invalid", () => {
    const raw = Array.from({ length: 250 }, (_, i) => `l${i}`).join("\n");
    // maxLines 0 -> default 200 -> keeps the last 200 (l50..l249)
    const out = processCapture(raw, { maxLines: 0 });
    expect(out.split("\n").length).toBe(200);
    expect(out.split("\n")[0]).toBe("l50");
    expect(out.endsWith("l249")).toBe(true);
  });
});

describe("processCapture — empty", () => {
  it("returns '' for an empty buffer", () => {
    expect(processCapture("")).toBe("");
  });

  it("returns '' for a whitespace/control-only buffer", () => {
    expect(processCapture(`  \n\t${ESC}[0m\n  `)).toBe("");
  });
});

describe("captureToSnapshot — metadata", () => {
  it("reports lineCount and not-truncated for a small buffer", () => {
    const snap = captureToSnapshot("a\nb\nc");
    expect(snap).toEqual({ text: "a\nb\nc", lineCount: 3, truncated: false });
  });

  it("reports truncated:true when clipped to maxLines", () => {
    const raw = Array.from({ length: 10 }, (_, i) => `line${i}`).join("\n");
    const snap = captureToSnapshot(raw, { maxLines: 3 });
    expect(snap.lineCount).toBe(3);
    expect(snap.truncated).toBe(true);
    expect(snap.text).toBe("line7\nline8\nline9");
  });

  it("reports truncated:false when exactly at maxLines", () => {
    const raw = "a\nb\nc";
    const snap = captureToSnapshot(raw, { maxLines: 3 });
    expect(snap.truncated).toBe(false);
  });

  it("returns empty metadata for an empty buffer", () => {
    expect(captureToSnapshot("")).toEqual({ text: "", lineCount: 0, truncated: false });
  });

  it("strips ANSI before counting lines (untrusted content)", () => {
    const snap = captureToSnapshot(`${ESC}[31ma${ESC}[0m\nb`);
    expect(snap).toEqual({ text: "a\nb", lineCount: 2, truncated: false });
  });
});

describe("capture panel toggle (Meta+J)", () => {
  it("starts hidden", () => {
    expect(emptyCapturePanelState()).toEqual({ visible: false });
  });

  it("flips visible on toggle", () => {
    expect(toggleCapturePanel({ visible: false })).toEqual({ visible: true });
    expect(toggleCapturePanel({ visible: true })).toEqual({ visible: false });
  });

  it("is immutable — does not mutate the input state", () => {
    const state = { visible: false };
    const next = toggleCapturePanel(state);
    expect(state.visible).toBe(false);
    expect(next).not.toBe(state);
  });
});

describe("captureEnabled — default off", () => {
  it("is false when unset", () => {
    expect(captureEnabled({})).toBe(false);
  });

  it("is true only for exactly '1'", () => {
    expect(captureEnabled({ VANTA_TERMINAL_CAPTURE: "1" })).toBe(true);
    expect(captureEnabled({ VANTA_TERMINAL_CAPTURE: "0" })).toBe(false);
    expect(captureEnabled({ VANTA_TERMINAL_CAPTURE: "true" })).toBe(false);
  });
});
