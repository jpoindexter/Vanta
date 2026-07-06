import { describe, it, expect } from "vitest";
import { capabilities, DEFAULT_CAPABILITIES, resolveCapabilities, segmentsFor, deliveryMode, type AdapterCapabilities } from "./capabilities.js";
import type { PlatformAdapter } from "./base.js";
import { TelegramAdapter } from "./telegram.js";

// MSG-CAPABILITY-DESCRIPTOR — the send/split path reads limits off the live adapter.

function fakeAdapter(caps?: AdapterCapabilities): PlatformAdapter {
  return { id: "fake", capabilities: caps, connect: async () => {}, disconnect: async () => {}, send: async () => {}, poll: async () => [] };
}

describe("resolveCapabilities", () => {
  it("returns declared caps, or the conservative defaults when absent", () => {
    expect(resolveCapabilities(fakeAdapter())).toEqual(DEFAULT_CAPABILITIES);
    const declared = capabilities({ charLimit: 500, lenUnit: "bytes", supportsEdit: true });
    expect(resolveCapabilities(fakeAdapter(declared))).toEqual(declared);
  });

  it("reads the real Telegram adapter's declared capabilities off the instance", () => {
    const caps = resolveCapabilities(new TelegramAdapter({ token: "T" }));
    expect(caps).toMatchObject({ charLimit: 4096, lenUnit: "utf16", supportsThreads: true, markdownDialect: "telegram" });
  });
});

describe("capabilities()", () => {
  it("merges overrides onto defaults", () => {
    expect(capabilities({ charLimit: 100 })).toEqual({ ...DEFAULT_CAPABILITIES, charLimit: 100 });
  });
});

describe("segmentsFor", () => {
  it("splits to the declared budget in the declared unit; never over-limit", () => {
    const caps = capabilities({ charLimit: 10, lenUnit: "chars" });
    const segs = segmentsFor("line one\nline two\nline three", caps);
    expect(segs.every((s) => s.length <= 10)).toBe(true);
    expect(segs.join("").replace(/\s/g, "")).toContain("lineone");
  });

  it("a utf16 budget counts astral chars as 2 (Telegram's real unit)", () => {
    // "𝟘" is a 2-code-unit astral digit; a 4-char limit fits two of them.
    const caps = capabilities({ charLimit: 4, lenUnit: "utf16" });
    const segs = segmentsFor("𝟘𝟘𝟘", caps);
    expect(segs.length).toBeGreaterThan(1);
  });

  it("short text returns a single segment", () => {
    expect(segmentsFor("hi", capabilities({ charLimit: 100 }))).toEqual(["hi"]);
  });
});

describe("deliveryMode", () => {
  it("an edit-capable adapter edits in place; a no-edit adapter sends one message per segment", () => {
    expect(deliveryMode(capabilities({ supportsEdit: true }))).toBe("edit-in-place");
    expect(deliveryMode(capabilities({ supportsEdit: false }))).toBe("one-message-per-segment");
    // The default (no declaration) degrades safely.
    expect(deliveryMode(DEFAULT_CAPABILITIES)).toBe("one-message-per-segment");
  });
});
