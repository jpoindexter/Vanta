import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./design/reference-shell.css", import.meta.url), "utf8");

describe("chat workspace elevation source contract", () => {
  it("uses named layered workspace and frame shadows without a pointer-catching overlay", () => {
    expect(css).toContain("--chat-workspace-shadow:");
    expect(css).toContain("box-shadow: var(--chat-workspace-shadow)");
    expect(css).toContain("box-shadow: var(--chat-frame-shadow)");
    const frame = css.match(/\.chat-first-shell::after\s*\{([^}]+)\}/)?.[1];
    expect(frame).toContain("pointer-events: none");
  });

  it("removes decorative elevation in forced colors and keeps an explicit system edge", () => {
    const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(forced).toContain("--chat-workspace-shadow: none");
    expect(forced).toContain("--chat-frame-shadow: none");
    expect(forced).toContain("border: 1px solid CanvasText");
  });
});
