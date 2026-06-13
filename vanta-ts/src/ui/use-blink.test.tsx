import { createElement as h, type ReactElement } from "react";
import { describe, it, expect } from "vitest";
import { Text } from "ink";
import { renderUi, tick } from "./test-render.js";
import { useBlink } from "./use-blink.js";

function Probe(): ReactElement {
  return h(Text, null, useBlink(40) ? "ON" : "OFF");
}

describe("useBlink", () => {
  it("starts shown, then flips the phase on its interval", async () => {
    const inst = renderUi(h(Probe));
    await tick();
    expect(inst.lastFrame()).toContain("ON"); // leading phase = cursor shown
    await new Promise((r) => setTimeout(r, 100)); // past >1 interval
    expect(inst.lastFrame()).toContain("OFF"); // it toggled (dark phase)
    inst.unmount();
  });
});
