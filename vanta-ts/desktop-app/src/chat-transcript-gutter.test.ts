import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync(new URL("./design/reference-shell.css", import.meta.url), "utf8");
const base = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function declarations(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1] ?? "";
}

// Source contracts only; packaged layout and hit testing establish geometry.
describe("chat transcript and prompt gutter", () => {
  it("keeps transcript gutters symmetric with the composer column", () => {
    const padding = declarations(shell, ".chat-first-shell .chat-thread")
      .match(/padding:\s*([^;]+)/)?.[1]?.trim().split(/\s+/);
    expect(padding).toBeDefined();
    const [, right, , left = right] = padding!;
    expect(left).toBe(right);
  });

  it("keeps prompt hit targets entirely outside message actions", () => {
    const gutter = Number.parseFloat(declarations(shell, ".chat-first-shell .chat-thread").match(/padding:\s*\S+\s+([^;\s]+)/)?.[1] ?? "NaN");
    const left = Number.parseFloat(declarations(shell, ".chat-first-shell .prompt-markers").match(/left:\s*([^;]+)/)?.[1] ?? "NaN");
    const width = Number.parseFloat(declarations(base, ".prompt-markers").match(/width:\s*([^;]+)/)?.[1] ?? "NaN");
    expect(width).toBeGreaterThanOrEqual(24);
    expect(left + width).toBeLessThanOrEqual(gutter);
    expect(declarations(shell, ".chat-first-shell .prompt-markers button:focus-visible"))
      .toContain("outline-offset: -2px");
  });
});
