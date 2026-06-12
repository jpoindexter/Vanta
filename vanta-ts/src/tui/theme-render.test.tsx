import { createElement as h } from "react";
import { describe, it, expect, afterAll } from "vitest";
import { Text } from "ink";
import chalk from "chalk";
import { render } from "./test-render.js";
import { Overlay } from "./overlay.js";

// Guards the bare-colour-name regression: the vendored fork's colorize() used to
// drop bare Ink names ("cyan", "gray", …), so the whole TUI — and every theme —
// rendered with no colour. The harness runs chalk at level 0 (colourless), so we
// force a colour level here and assert the actual SGR codes in the raw frames.

const ESC = String.fromCharCode(27); // \x1b — the CSI introducer in SGR codes
const prevLevel = (chalk as { level: number }).level;
(chalk as { level: number }).level = 3;
afterAll(() => {
  (chalk as { level: number }).level = prevLevel;
  delete process.env.VANTA_THEME;
});

const raw = (inst: { frames: string[] }): string => inst.frames.join("");

describe("themed rendering", () => {
  it("bare foreground colour names emit SGR codes (the core fix)", () => {
    const inst = render(h(Text, { color: "cyan" }, "x"));
    expect(raw(inst)).toContain(`${ESC}[36m`); // cyan — was absent before the fix
    inst.unmount();
  });

  it("a green background chip renders (status bar '● ready')", () => {
    const inst = render(h(Text, { backgroundColor: "green", color: "black" }, " ● ready "));
    expect(raw(inst)).toContain(`${ESC}[42m`); // bg green
    inst.unmount();
  });

  it("the default theme paints an overlay accent cyan", () => {
    process.env.VANTA_THEME = "default";
    const inst = render(h(Overlay, { title: "T", width: 30, children: h(Text, null, "row") }));
    expect(raw(inst)).toContain(`${ESC}[36m`); // cyan accent
    inst.unmount();
  });

  it("switching the theme changes the rendered accent colour", () => {
    process.env.VANTA_THEME = "dyslexia"; // accent: yellow
    const inst = render(h(Overlay, { title: "T", width: 30, children: h(Text, null, "row") }));
    const out = raw(inst);
    expect(out).toContain(`${ESC}[33m`); // yellow accent
    expect(out).not.toContain(`${ESC}[36m`); // and NOT the default cyan
    inst.unmount();
  });
});
