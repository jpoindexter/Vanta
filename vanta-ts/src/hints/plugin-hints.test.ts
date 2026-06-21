import { describe, it, expect } from "vitest";
import type { VantaHint } from "./vanta-hints.js";
import {
  parsePluginHints,
  buildPluginSuggestion,
  pluginHintSuggestions,
  pluginSuggestionsFromText,
  isSafePluginName,
} from "./plugin-hints.js";

const ESC = String.fromCharCode(0x1b); // a control byte, kept out of the source as a literal
const BELL = String.fromCharCode(0x07);

const plugin = (name: string, marketplace?: string): VantaHint =>
  marketplace ? { type: "plugin", name, marketplace } : { type: "plugin", name };

describe("parsePluginHints", () => {
  it("returns the name of a plugin-kind hint", () => {
    expect(parsePluginHints([plugin("pylsp", "agent-skills")])).toEqual(["pylsp"]);
  });

  it("ignores a non-plugin hint", () => {
    const hints: VantaHint[] = [{ type: "skill", name: "ruff" }, plugin("pylsp")];
    expect(parsePluginHints(hints)).toEqual(["pylsp"]);
  });

  it("returns [] when there are no hints", () => {
    expect(parsePluginHints([])).toEqual([]);
  });

  it("returns [] when no hint is plugin-kind", () => {
    expect(parsePluginHints([{ type: "skill", name: "ruff" }])).toEqual([]);
  });

  it("preserves order and keeps duplicates (dedup is the suggestion layer's job)", () => {
    expect(parsePluginHints([plugin("a"), plugin("b"), plugin("a")])).toEqual(["a", "b", "a"]);
  });

  it("drops an unsafe plugin name (shell metacharacters)", () => {
    expect(parsePluginHints([plugin("pylsp; rm -rf /")])).toEqual([]);
  });

  it("drops a plugin name containing a path separator", () => {
    expect(parsePluginHints([plugin("../../etc/passwd")])).toEqual([]);
  });

  it("drops a plugin name containing whitespace", () => {
    expect(parsePluginHints([plugin("py lsp")])).toEqual([]);
  });

  it("drops a plugin name with command substitution", () => {
    expect(parsePluginHints([plugin("$(whoami)")])).toEqual([]);
    expect(parsePluginHints([plugin("`id`")])).toEqual([]);
  });

  it("strips a control byte and keeps the safe remainder of the name", () => {
    expect(parsePluginHints([plugin("ru" + ESC + "ff")])).toEqual(["ruff"]);
  });

  it("drops a name that is ONLY a control byte (strips to empty so unsafe)", () => {
    expect(parsePluginHints([plugin(BELL)])).toEqual([]);
  });
});

describe("isSafePluginName", () => {
  it("accepts bare slugs with letters, digits, dash, underscore", () => {
    expect(isSafePluginName("py-lsp_2")).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(isSafePluginName("")).toBe(false);
  });

  it("rejects shell metacharacters, paths, and spaces", () => {
    for (const bad of ["a;b", "a b", "a/b", "$(x)", "`x`", "a|b", "a&&b", "-leading?"]) {
      expect(isSafePluginName(bad)).toBe(false);
    }
  });
});

describe("buildPluginSuggestion", () => {
  it("names the plugin and the `vanta plugins add` command", () => {
    const s = buildPluginSuggestion("pylsp");
    expect(s).toBe(
      "\u{1F4A1} a tool suggested the pylsp plugin — run `vanta plugins add pylsp` to enable it",
    );
  });

  it("references the plugin name in the runnable command", () => {
    const s = buildPluginSuggestion("ruff");
    expect(s).toContain("`vanta plugins add ruff`");
  });

  it("returns null for an unsafe name so no injection can be wrapped into a command", () => {
    expect(buildPluginSuggestion("pylsp; rm -rf /")).toBeNull();
    expect(buildPluginSuggestion("$(whoami)")).toBeNull();
    expect(buildPluginSuggestion("../escape")).toBeNull();
  });

  it("returns null for a name that strips to empty (only a control byte)", () => {
    expect(buildPluginSuggestion(BELL)).toBeNull();
    expect(buildPluginSuggestion("")).toBeNull();
  });
});

describe("pluginHintSuggestions", () => {
  it("builds a suggestion line per plugin hint", () => {
    const lines = pluginHintSuggestions([plugin("pylsp"), plugin("ruff")]);
    expect(lines).toEqual([
      "\u{1F4A1} a tool suggested the pylsp plugin — run `vanta plugins add pylsp` to enable it",
      "\u{1F4A1} a tool suggested the ruff plugin — run `vanta plugins add ruff` to enable it",
    ]);
  });

  it("dedupes repeated plugin names", () => {
    const lines = pluginHintSuggestions([plugin("pylsp"), plugin("pylsp", "agent-skills")]);
    expect(lines).toEqual([
      "\u{1F4A1} a tool suggested the pylsp plugin — run `vanta plugins add pylsp` to enable it",
    ]);
  });

  it("returns [] with no plugin hints", () => {
    expect(pluginHintSuggestions([])).toEqual([]);
    expect(pluginHintSuggestions([{ type: "skill", name: "ruff" }])).toEqual([]);
  });

  it("returns [] when every plugin name is unsafe", () => {
    expect(pluginHintSuggestions([plugin("a;b"), plugin("../x")])).toEqual([]);
  });

  it("never auto-installs — it only returns suggestion strings", () => {
    const out = pluginHintSuggestions([plugin("pylsp")]);
    expect(Array.isArray(out)).toBe(true);
    expect(out.every((l) => typeof l === "string" && l.startsWith("\u{1F4A1}"))).toBe(true);
  });
});

describe("pluginSuggestionsFromText", () => {
  it("parses a stderr line via the Vanta hint protocol and suggests the plugin", () => {
    const text = 'building <vanta-hint type="plugin" name="pylsp" /> done';
    expect(pluginSuggestionsFromText(text)).toEqual([
      "\u{1F4A1} a tool suggested the pylsp plugin — run `vanta plugins add pylsp` to enable it",
    ]);
  });

  it("accepts the claude-code-hint interop alias identically", () => {
    const text = '<claude-code-hint type="plugin" name="ruff" />';
    expect(pluginSuggestionsFromText(text)).toEqual([
      "\u{1F4A1} a tool suggested the ruff plugin — run `vanta plugins add ruff` to enable it",
    ]);
  });

  it("returns [] for stderr with no hint", () => {
    expect(pluginSuggestionsFromText("just regular output\nno hints")).toEqual([]);
  });

  it("does not suggest a non-plugin hint", () => {
    const text = '<vanta-hint type="skill" name="ruff" />';
    expect(pluginSuggestionsFromText(text)).toEqual([]);
  });
});
