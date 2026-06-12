import { createElement as h, useState, type ReactElement } from "react";
import { describe, it, expect, afterAll } from "vitest";
import { Box, Text } from "ink";
import chalk from "chalk";
import { render } from "./test-render.js";
import { ThemePicker } from "./theme-picker.js";
import { resolveThemeByName } from "./theme.js";

// End-to-end proof that live theme switching recolours the UI. Mirrors the App
// wiring: themeName state + a setTheme that writes env + state, a composer-like
// border driven by theme.border, and the real ThemePicker. Arrowing the picker
// must change the composer's rendered border colour. Harness runs colourless
// (chalk level 0), so force a level and read the real SGR codes.

const ESC = String.fromCharCode(27);
const prevLevel = (chalk as { level: number }).level;
(chalk as { level: number }).level = 3;
afterAll(() => {
  (chalk as { level: number }).level = prevLevel;
  delete process.env.VANTA_THEME;
});

function Harness(): ReactElement {
  const [name, setName] = useState("default");
  const setTheme = (n: string): void => {
    process.env.VANTA_THEME = n;
    setName(n);
  };
  const theme = resolveThemeByName(name);
  return h(
    Box,
    { flexDirection: "column" },
    h(Box, { key: "c", borderStyle: "round", borderColor: theme.border }, h(Text, null, "composer")),
    h(ThemePicker, { key: "p", current: name, width: 30, onApply: setTheme, onClose: () => {} }),
  );
}

const wait = (): Promise<void> => new Promise((r) => setTimeout(r, 70));

describe("live theme switching (end-to-end)", () => {
  it("arrowing the picker recolours the composer border in real time", async () => {
    process.env.VANTA_THEME = "default";
    const inst = render(h(Harness));
    await wait();
    // default theme: border = cyan (\x1b[36m); no white yet.
    const mark = inst.frames.length;
    inst.stdin.write(`${ESC}[B`); // arrow down → high-contrast (border = white)
    await wait();
    const afterSwitch = inst.frames.slice(mark).join("");
    expect(afterSwitch).toContain(`${ESC}[37m`); // white border — proves the switch repainted it
    inst.unmount();
  });
});
