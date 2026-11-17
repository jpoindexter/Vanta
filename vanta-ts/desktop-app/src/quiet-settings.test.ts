import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tokens = readFileSync(new URL("./design/tokens.css", import.meta.url), "utf8");
const workspaces = readFileSync(new URL("./design/chat-first-workspaces.css", import.meta.url), "utf8");

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return workspaces.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1] ?? "";
}

// Source contracts only: packaged screenshots must establish actual geometry.
describe("Settings spacing source contracts", () => {
  it("defines every spacing token used by the workbench surfaces", () => {
    const defined = new Set([...tokens.matchAll(/(--space-\d+)\s*:/g)].map((match) => match[1]));
    const used = new Set([...workspaces.matchAll(/var\((--space-\d+)\)/g)].map((match) => match[1]));
    expect([...used].filter((token) => !defined.has(token))).toEqual([]);
    expect(tokens).toMatch(/--space-5:\s*20px;/);
  });

  it("pads the dialog header and content with the defined 20px token", () => {
    expect(declarations(".chat-first-shell .settings-dialog > header")).toContain("padding: var(--space-5)");
    expect(declarations(".chat-first-shell .settings-content")).toContain("padding: var(--space-5)");
  });
});

describe("Settings non-stretch source contracts", () => {
  it("keeps content and section tracks at their intrinsic height", () => {
    expect(declarations(".chat-first-shell .settings-content")).toContain("align-content: start");
    expect(declarations(".chat-first-shell .settings-content")).toContain("margin: 0");
    expect(declarations(".chat-first-shell .settings-content section")).toContain("align-content: start");
  });

  it("keeps theme choices compact without shrinking text at larger zoom", () => {
    expect(declarations(".chat-first-shell .settings-content .theme-picker")).toContain("align-items: center");
    const button = declarations(".chat-first-shell .settings-content .theme-picker button");
    expect(button).toContain("min-height: var(--control-height-compact)");
    expect(button).toContain("margin: 0");
    expect(button).not.toMatch(/(?:^|;)\s*height:\s*\d/);
  });
});
