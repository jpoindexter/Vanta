import { describe, it, expect } from "vitest";
import { parseVantaHints, formatHintSuggestion } from "./vanta-hints.js";

describe("parseVantaHints", () => {
  it("parses a native vanta-hint tag and strips it from the text", () => {
    const text = 'before <vanta-hint type="plugin" name="pylsp" marketplace="agent-skills" /> after';
    const r = parseVantaHints(text);
    expect(r.hints).toEqual([{ type: "plugin", name: "pylsp", marketplace: "agent-skills" }]);
    expect(r.stripped).toBe("before  after");
  });

  it("parses the external claude-code-hint interop alias identically", () => {
    const text = 'log line <claude-code-hint type="plugin" name="pylsp" marketplace="agent-skills" />';
    const r = parseVantaHints(text);
    expect(r.hints).toEqual([{ type: "plugin", name: "pylsp", marketplace: "agent-skills" }]);
    expect(r.stripped).toBe("log line ");
  });

  it("is attribute-order-independent", () => {
    const text = '<vanta-hint name="ruff" marketplace="agent-skills" type="plugin" />';
    const r = parseVantaHints(text);
    expect(r.hints).toEqual([{ type: "plugin", name: "ruff", marketplace: "agent-skills" }]);
  });

  it("treats marketplace as optional", () => {
    const r = parseVantaHints('<vanta-hint type="plugin" name="pylsp" />');
    expect(r.hints).toEqual([{ type: "plugin", name: "pylsp" }]);
    expect(r.stripped).toBe("");
  });

  it("parses multiple hints (native + interop alias) and strips all tags", () => {
    const text =
      'a <vanta-hint type="plugin" name="pylsp" /> b <claude-code-hint type="plugin" name="ruff" /> c';
    const r = parseVantaHints(text);
    expect(r.hints).toEqual([
      { type: "plugin", name: "pylsp" },
      { type: "plugin", name: "ruff" },
    ]);
    expect(r.stripped).toBe("a  b  c");
  });

  it("leaves text byte-identical and hints empty when no tag is present", () => {
    const text = "no hints here, just regular stderr output\nline two";
    const r = parseVantaHints(text);
    expect(r.hints).toEqual([]);
    expect(r.stripped).toBe(text);
  });

  it("drops a malformed tag from hints but still strips it from the output", () => {
    const text = 'x <vanta-hint type="plugin" /> y';
    const r = parseVantaHints(text);
    expect(r.hints).toEqual([]);
    expect(r.stripped).toBe("x  y");
  });
});

describe("formatHintSuggestion", () => {
  it("formats a plugin install suggestion with the marketplace", () => {
    const s = formatHintSuggestion([{ type: "plugin", name: "pylsp", marketplace: "agent-skills" }]);
    expect(s).toBe("Install pylsp plugin? (from agent-skills)");
  });

  it("formats a suggestion without a marketplace", () => {
    const s = formatHintSuggestion([{ type: "plugin", name: "pylsp" }]);
    expect(s).toBe("Install pylsp plugin?");
  });

  it("joins multiple plugin suggestions onto separate lines", () => {
    const s = formatHintSuggestion([
      { type: "plugin", name: "pylsp" },
      { type: "plugin", name: "ruff", marketplace: "agent-skills" },
    ]);
    expect(s).toBe("Install pylsp plugin?\nInstall ruff plugin? (from agent-skills)");
  });
});
