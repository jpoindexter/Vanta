import { describe, expect, it } from "vitest";
import { positionModelPopover } from "./model-popover-position.js";

const viewport = { width: 1440, height: 900 };
const menu = { width: 320, height: 280 };

describe("model popover positioning", () => {
  it("attaches above a centered new-chat composer", () => {
    expect(positionModelPopover({ anchor: { left: 1010, right: 1110, top: 550, bottom: 582 }, menu, viewport }))
      .toMatchObject({ left: 790, top: 262, maxHeight: 530 });
  });

  it("stays above the bottom composer rather than at a fixed window corner", () => {
    expect(positionModelPopover({ anchor: { left: 1010, right: 1110, top: 830, bottom: 862 }, menu, viewport }))
      .toMatchObject({ left: 790, top: 542, maxHeight: 560 });
  });

  it("flips below a trigger with insufficient room above", () => {
    expect(positionModelPopover({ anchor: { left: 1010, right: 1110, top: 40, bottom: 72 }, menu, viewport }))
      .toMatchObject({ left: 790, top: 80, maxHeight: 560 });
  });

  it("clamps narrow viewports and bounds long controls to scrollable room", () => {
    expect(positionModelPopover({ anchor: { left: 8, right: 90, top: 150, bottom: 182 }, menu: { width: 320, height: 800 }, viewport: { width: 300, height: 500 } }))
      .toEqual({ left: 12, top: 190, maxWidth: 276, maxHeight: 298 });
  });

  it("repositions from the latest trigger geometry after resizing or a sidebar change", () => {
    const before = positionModelPopover({ anchor: { left: 1010, right: 1110, top: 550, bottom: 582 }, menu, viewport });
    const after = positionModelPopover({ anchor: { left: 340, right: 440, top: 430, bottom: 462 }, menu, viewport: { width: 760, height: 720 } });
    expect(after).toMatchObject({ left: 120, top: 142, maxWidth: 736 });
    expect(after.left).not.toBe(before.left);
    expect(after.top + menu.height + 8).toBe(430);
  });
});
