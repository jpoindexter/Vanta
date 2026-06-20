import { describe, it, expect } from "vitest";
import {
  buildClipboardImageHint,
  clipboardHintEnabled,
  clipboardHasImage,
  maybeClipboardHint,
  type ClipboardHintDeps,
} from "./clipboard-image-hint.js";

const HINT = "📋 an image is on your clipboard — /paste to attach it";

function deps(over: Partial<ClipboardHintDeps>): ClipboardHintDeps {
  return {
    probe: () => true,
    env: {} as NodeJS.ProcessEnv,
    ...over,
  };
}

describe("buildClipboardImageHint", () => {
  it("is the canonical one-line /paste hint", () => {
    expect(buildClipboardImageHint()).toBe(HINT);
  });
});

describe("clipboardHintEnabled", () => {
  it("defaults on when the env var is unset", () => {
    expect(clipboardHintEnabled({} as NodeJS.ProcessEnv)).toBe(true);
  });

  it("stays on for any value other than 0", () => {
    expect(clipboardHintEnabled({ VANTA_CLIPBOARD_HINT: "1" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("is disabled by VANTA_CLIPBOARD_HINT=0", () => {
    expect(clipboardHintEnabled({ VANTA_CLIPBOARD_HINT: "0" } as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("clipboardHasImage", () => {
  it("is true when the probe reports an image", () => {
    expect(clipboardHasImage(deps({ probe: () => true }))).toBe(true);
  });

  it("is false when the probe reports no image", () => {
    expect(clipboardHasImage(deps({ probe: () => false }))).toBe(false);
  });

  it("is false (never throws) when the probe throws", () => {
    expect(clipboardHasImage(deps({ probe: () => { throw new Error("clipboard unavailable"); } }))).toBe(false);
  });
});

describe("maybeClipboardHint", () => {
  it("returns the hint when enabled and an image is present", () => {
    expect(maybeClipboardHint(deps({ probe: () => true }))).toBe(HINT);
  });

  it("returns null when there is no image", () => {
    expect(maybeClipboardHint(deps({ probe: () => false }))).toBeNull();
  });

  it("returns null when the probe throws (degrades to no image, never throws)", () => {
    expect(maybeClipboardHint(deps({ probe: () => { throw new Error("boom"); } }))).toBeNull();
  });

  it("returns null when disabled via env even with an image present", () => {
    expect(
      maybeClipboardHint(deps({ probe: () => true, env: { VANTA_CLIPBOARD_HINT: "0" } as NodeJS.ProcessEnv })),
    ).toBeNull();
  });
});
