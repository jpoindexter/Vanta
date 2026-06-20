import { describe, it, expect, vi } from "vitest";
import {
  detectDataUriImage,
  renderInlineImage,
  inlineImagePlaceholder,
  emitInlineImage,
} from "./image-output.js";

// 1x1 transparent PNG (the canonical tiny fixture).
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
const PNG_URI = `data:image/png;base64,${PNG_B64}`;

describe("detectDataUriImage", () => {
  it("detects a valid base64 data URI image", () => {
    const got = detectDataUriImage(PNG_URI);
    expect(got).toEqual({ mime: "image/png", base64: PNG_B64 });
  });

  it("detects a data URI surrounded by whitespace/newlines (trimmed)", () => {
    const got = detectDataUriImage(`\n  ${PNG_URI}\n`);
    expect(got).toEqual({ mime: "image/png", base64: PNG_B64 });
  });

  it("detects jpeg and webp mimes too", () => {
    expect(detectDataUriImage("data:image/jpeg;base64,QUJD")?.mime).toBe("image/jpeg");
    expect(detectDataUriImage("data:image/webp;base64,QUJD")?.mime).toBe("image/webp");
  });

  it("ignores normal text output", () => {
    expect(detectDataUriImage("exit 0")).toBeNull();
    expect(detectDataUriImage("hello\nworld\n254 lines of logs")).toBeNull();
    expect(detectDataUriImage("")).toBeNull();
  });

  it("ignores a non-image data URI", () => {
    expect(detectDataUriImage("data:text/plain;base64,QUJD")).toBeNull();
    expect(detectDataUriImage("data:application/pdf;base64,QUJD")).toBeNull();
  });

  it("ignores a data URI that is only mentioned mid-output (must span the whole output)", () => {
    expect(detectDataUriImage(`the screenshot is ${PNG_URI}`)).toBeNull();
    expect(detectDataUriImage(`${PNG_URI}\nplus trailing log line`)).toBeNull();
  });

  it("ignores a non-base64 (e.g. url-encoded) image data URI", () => {
    expect(detectDataUriImage("data:image/svg+xml,<svg></svg>")).toBeNull();
    expect(detectDataUriImage("data:image/png;base64,")).toBeNull();
  });
});

describe("renderInlineImage", () => {
  it("formats the iTerm2 OSC 1337 inline-image escape sequence", () => {
    const out = renderInlineImage({ mime: "image/png", base64: PNG_B64 });
    // ESC ] 1337 ; File=inline=1;size=<bytes>;preserveAspectRatio=1 : <base64> BEL
    expect(out.startsWith("\x1b]1337;File=inline=1;")).toBe(true);
    expect(out.endsWith(`:${PNG_B64}\x07`)).toBe(true);
    expect(out).toContain("preserveAspectRatio=1");
    expect(out).not.toContain("\n");
  });

  it("encodes the decoded byte length in the size field", () => {
    // "QUJD" decodes to "ABC" → 3 bytes.
    const out = renderInlineImage({ mime: "image/png", base64: "QUJD" });
    expect(out).toContain("size=3;");
  });
});

describe("inlineImagePlaceholder", () => {
  it("renders a short clip-safe placeholder, never the raw base64", () => {
    const ph = inlineImagePlaceholder({ mime: "image/png", base64: PNG_B64 });
    expect(ph).toContain("[inline image");
    expect(ph).toContain("image/png");
    expect(ph).not.toContain(PNG_B64);
    expect(ph.length).toBeLessThan(50);
  });

  it("uses KB for payloads >= 1 KiB and B otherwise", () => {
    expect(inlineImagePlaceholder({ mime: "image/png", base64: "QUJD" })).toContain("3 B");
    const big = "A".repeat(4000); // ~3000 decoded bytes
    expect(inlineImagePlaceholder({ mime: "image/png", base64: big })).toMatch(/KB\]$/);
  });
});

describe("emitInlineImage", () => {
  it("writes the inline-image escape and returns the placeholder on a supporting TTY", () => {
    const write = vi.fn();
    const out = emitInlineImage(PNG_URI, { env: { TERM_PROGRAM: "iTerm.app" }, isTTY: true, write });
    expect(out).toContain("[inline image");
    expect(write).toHaveBeenCalledTimes(1);
    const chunk = String(write.mock.calls[0]?.[0]);
    expect(chunk).toContain("\x1b]1337;File=inline=1;");
    expect(chunk).toContain(PNG_B64);
  });

  it("returns the placeholder but does NOT write on an unsupported terminal (base64 still hidden)", () => {
    const write = vi.fn();
    const out = emitInlineImage(PNG_URI, { env: { TERM_PROGRAM: "Apple_Terminal" }, isTTY: true, write });
    expect(out).toContain("[inline image");
    expect(write).not.toHaveBeenCalled();
  });

  it("does not write when not a TTY (piped/captured output)", () => {
    const write = vi.fn();
    const out = emitInlineImage(PNG_URI, { env: { TERM_PROGRAM: "iTerm.app" }, isTTY: false, write });
    expect(out).toContain("[inline image");
    expect(write).not.toHaveBeenCalled();
  });

  it("honors the VANTA_INLINE_IMAGES override (force on)", () => {
    const write = vi.fn();
    emitInlineImage(PNG_URI, { env: { VANTA_INLINE_IMAGES: "1", TERM_PROGRAM: "Apple_Terminal" }, isTTY: true, write });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("returns null and writes nothing for non-image output", () => {
    const write = vi.fn();
    expect(emitInlineImage("exit 0", { env: { TERM_PROGRAM: "iTerm.app" }, isTTY: true, write })).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });
});
