import { describe, it, expect } from "vitest";
import { parseStylesheet, resolveStyle } from "./stylesheet.js";
import { resolveRoutedProvider } from "./model-router.js";
import { resolveProvider } from "../providers/index.js";

describe("parseStylesheet", () => {
  it("parses the universal rule and a class rule", () => {
    const r = parseStylesheet(
      "* { model: haiku; reasoning_effort: low } .coding { model: sonnet; reasoning_effort: high }",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.stylesheet.universal).toEqual({ model: "haiku", effort: "low" });
    expect(r.stylesheet.classes.coding).toEqual({ model: "sonnet", effort: "high" });
  });

  it("accepts `effort` as an alias for `reasoning_effort`", () => {
    const r = parseStylesheet("* { model: haiku; effort: max }");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.stylesheet.universal?.effort).toBe("max");
  });

  it("tolerates whitespace, newlines, and trailing semicolons", () => {
    const r = parseStylesheet(`
      *        { model: haiku;  reasoning_effort: low; }
      .trivial { model: nano; }
    `);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.stylesheet.universal?.model).toBe("haiku");
    expect(r.stylesheet.classes.trivial).toEqual({ model: "nano" });
  });

  it("ignores unknown declaration keys (forward-compatible)", () => {
    const r = parseStylesheet("* { model: haiku; temperature: 0.5 }");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.stylesheet.universal).toEqual({ model: "haiku" });
  });

  it("returns an empty stylesheet for empty input", () => {
    const r = parseStylesheet("");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.stylesheet.classes).toEqual({});
    expect(r.stylesheet.universal).toBeUndefined();
  });

  it("rejects an invalid effort level with the allowed list", () => {
    const r = parseStylesheet("* { model: haiku; reasoning_effort: turbo }");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("low, medium, high, xhigh, max");
    expect(r.error).toContain("turbo");
  });

  it("rejects a declaration missing a colon", () => {
    const r = parseStylesheet("* { model haiku }");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("missing a");
  });

  it("rejects an unsupported selector", () => {
    const r = parseStylesheet("#id { model: haiku }");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Unsupported selector");
  });

  it("rejects malformed input with no rule blocks", () => {
    const r = parseStylesheet("model: haiku");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("No rules found");
  });
});

describe("resolveStyle", () => {
  const sheet = parseStylesheet(
    "* { model: haiku; reasoning_effort: low } .coding { model: sonnet; reasoning_effort: high }",
  );
  function getSheet() {
    if (!sheet.ok) throw new Error("fixture stylesheet failed to parse");
    return sheet.stylesheet;
  }

  it("resolves a class rule layered over the universal rule", () => {
    const style = resolveStyle(getSheet(), "coding");
    expect(style?.model).toBe("sonnet");
    expect(style?.effort).toBe("high");
  });

  it("appends the universal rule as the last-resort fallback entry", () => {
    const style = resolveStyle(getSheet(), "coding");
    expect(style?.fallback).toEqual([
      { model: "sonnet", effort: "high" },
      { model: "haiku", effort: "low" },
    ]);
  });

  it("falls back to the universal rule for an unmatched class", () => {
    const style = resolveStyle(getSheet(), "trivial");
    expect(style?.model).toBe("haiku");
    expect(style?.effort).toBe("low");
    // No distinct class model → the chain is just the universal entry.
    expect(style?.fallback).toEqual([{ model: "haiku", effort: "low" }]);
  });

  it("inherits the universal effort when a class omits its own", () => {
    const r = parseStylesheet("* { model: haiku; reasoning_effort: max } .coding { model: sonnet }");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const style = resolveStyle(r.stylesheet, "coding");
    expect(style?.effort).toBe("max");
  });

  it("uses the provided default effort when neither rule declares one", () => {
    const r = parseStylesheet("* { model: haiku }");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const style = resolveStyle(r.stylesheet, "coding", "high");
    expect(style?.effort).toBe("high");
  });

  it("returns null when no model can be resolved", () => {
    const r = parseStylesheet(".other { model: sonnet }");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // No universal rule and no rule for "coding" → nothing to route to.
    expect(resolveStyle(r.stylesheet, "coding")).toBeNull();
  });
});

describe("resolveRoutedProvider with a stylesheet", () => {
  const baseEnv: NodeJS.ProcessEnv = { VANTA_PROVIDER: "ollama" };

  it("routes an expensive task to the .coding class model", () => {
    const env: NodeJS.ProcessEnv = {
      ...baseEnv,
      VANTA_MODEL_STYLESHEET:
        "* { model: qwen2.5:7b; reasoning_effort: low } .coding { model: qwen2.5:72b; reasoning_effort: high }",
    };
    const provider = resolveRoutedProvider(env, "implement the parser");
    expect(provider.modelId()).toBe("qwen2.5:72b");
  });

  it("routes a trivial task to the universal model", () => {
    const env: NodeJS.ProcessEnv = {
      ...baseEnv,
      VANTA_MODEL_STYLESHEET:
        "* { model: qwen2.5:7b; reasoning_effort: low } .coding { model: qwen2.5:72b }",
    };
    const provider = resolveRoutedProvider(env, "list my goals");
    expect(provider.modelId()).toBe("qwen2.5:7b");
  });

  it("honors the resolved chain entry when its provider resolves cleanly", () => {
    // Both entries share the ollama provider (no key needed) → the first entry,
    // the .coding model, resolves and wins without touching the fallback.
    const provider = resolveRoutedProvider(
      { ...baseEnv, VANTA_MODEL_STYLESHEET: "* { model: a } .coding { model: b }" },
      "implement",
    );
    expect(provider.modelId()).toBe("b");
  });

  it("rethrows the last error when every fallback entry's provider throws", () => {
    // The stylesheet swaps only the model, so the provider is fixed at openai.
    // With no OPENAI_API_KEY, every entry throws — proving the loop tried each
    // entry in the chain before surfacing a real provider failure.
    const env: NodeJS.ProcessEnv = {
      VANTA_PROVIDER: "openai",
      OPENAI_API_KEY: undefined,
      VANTA_MODEL_STYLESHEET: "* { model: gpt-a } .coding { model: gpt-b }",
    };
    expect(() => resolveRoutedProvider(env, "implement")).toThrow(/OPENAI_API_KEY/);
  });

  it("ignores a malformed stylesheet and uses the legacy override path", () => {
    const env: NodeJS.ProcessEnv = {
      ...baseEnv,
      VANTA_MODEL_STYLESHEET: "this is not css",
      VANTA_MODEL_EXPENSIVE: "qwen2.5:72b",
    };
    const provider = resolveRoutedProvider(env, "implement the parser");
    expect(provider.modelId()).toBe("qwen2.5:72b");
  });

  it("with no stylesheet and no overrides, behaves byte-identically to the default", () => {
    const provider = resolveRoutedProvider(baseEnv, "implement the parser");
    expect(provider.modelId()).toBe(resolveProvider(baseEnv).modelId());
  });

  it("an unset stylesheet leaves the legacy cheap/expensive overrides working", () => {
    const env: NodeJS.ProcessEnv = { ...baseEnv, VANTA_MODEL_CHEAP: "qwen2.5:7b" };
    const provider = resolveRoutedProvider(env, "list my goals");
    expect(provider.modelId()).toBe("qwen2.5:7b");
  });
});
