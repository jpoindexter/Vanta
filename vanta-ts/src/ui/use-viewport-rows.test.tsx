import { createElement as h, type ReactElement } from "react";
import { Text } from "ink";
import { describe, it, expect } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { useViewportRows } from "./use-viewport-rows.js";

function Probe(): ReactElement {
  const vp = useViewportRows();
  return h(Text, null, `${vp.rows}x${vp.cols}`);
}

describe("useViewportRows", () => {
  it("reports the current terminal rows and cols", async () => {
    const inst = renderUi(h(Probe)); // harness stdout is 80 cols x 24 rows
    await tick();
    expect(inst.lastFrame()).toContain("24x80");
    inst.unmount();
  });
});
