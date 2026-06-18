import { describe, it, expect } from "vitest";
import {
  classifyBackbone, resolveBackbone, resolveDelivery,
  WEAK_INLINE_CHARS, FILE_PREVIEW_CHARS,
} from "./delivery-policy.js";

describe("classifyBackbone", () => {
  it("classifies frontier/large models as strong", () => {
    for (const m of ["gpt-4o", "gpt-5", "o3", "claude-opus-4-8", "claude-sonnet-4-6", "deepseek-v3", "qwen2.5:72b", "gemini-2.5-pro"]) {
      expect(classifyBackbone(m)).toBe("strong");
    }
  });

  it("classifies small/distilled models as weak", () => {
    for (const m of ["gpt-4o-mini", "o3-mini", "claude-haiku-4-5", "gemini-2.0-flash-lite", "qwen2.5:14b", "llama-3.1-8b", "gemma-7b"]) {
      expect(classifyBackbone(m)).toBe("weak");
    }
  });

  it("defaults an unknown model to strong (preserves existing offload behavior)", () => {
    expect(classifyBackbone("")).toBe("strong");
    expect(classifyBackbone("some-future-model")).toBe("strong");
  });
});

describe("resolveBackbone", () => {
  it("prefers an explicit model id over VANTA_MODEL", () => {
    expect(resolveBackbone({ VANTA_MODEL: "gpt-4o" }, "gpt-4o-mini")).toBe("weak");
  });
  it("falls back to VANTA_MODEL", () => {
    expect(resolveBackbone({ VANTA_MODEL: "claude-haiku-4-5" })).toBe("weak");
  });
});

describe("resolveDelivery", () => {
  it("strong backbone → file delivery with a short preview", () => {
    const d = resolveDelivery({}, "claude-opus-4-8");
    expect(d.mode).toBe("file");
    expect(d.inlineChars).toBe(FILE_PREVIEW_CHARS);
  });

  it("weak backbone → inline delivery with a larger window", () => {
    const d = resolveDelivery({}, "gpt-4o-mini");
    expect(d.mode).toBe("inline");
    expect(d.inlineChars).toBe(WEAK_INLINE_CHARS);
  });

  it("VANTA_FILE_DELIVERY=off forces inline even for a strong backbone", () => {
    expect(resolveDelivery({ VANTA_FILE_DELIVERY: "off" }, "gpt-4o").mode).toBe("inline");
  });

  it("VANTA_FILE_DELIVERY=on forces file even for a weak backbone", () => {
    expect(resolveDelivery({ VANTA_FILE_DELIVERY: "on" }, "gpt-4o-mini").mode).toBe("file");
  });
});
