import { type ReactElement } from "react";
import { describe, it, expect } from "vitest";
import { render } from "./test-render.js";
import { Overlay, OverlayRow, fillRow, overlayAccent } from "./overlay.js";

describe("fillRow", () => {
  it("pads a short string with trailing spaces so the bar spans the width", () => {
    expect(fillRow("hi", 5)).toBe("hi   ");
  });
  it("leaves an exact-width string untouched", () => {
    expect(fillRow("hello", 5)).toBe("hello");
  });
  it("clips an over-long string to the width", () => {
    expect(fillRow("hello world", 5)).toBe("hello");
  });
  it("returns empty for a non-positive width", () => {
    expect(fillRow("x", 0)).toBe("");
  });
});

describe("overlayAccent", () => {
  it("prefers an explicit colour (approval's yellow stays yellow)", () => {
    expect(overlayAccent("yellow", {} as NodeJS.ProcessEnv)).toBe("yellow");
  });
  it("falls back to the default theme accent", () => {
    expect(overlayAccent(undefined, {} as NodeJS.ProcessEnv)).toBe("cyan");
  });
  it("tracks VANTA_THEME for the accent", () => {
    const env = { VANTA_THEME: "dyslexia" } as unknown as NodeJS.ProcessEnv;
    expect(overlayAccent(undefined, env)).toBe("yellow");
  });
});

describe("OverlayRow", () => {
  const wrap = (selected: boolean): ReactElement =>
    (
      <Overlay title="picker" width={44}>
        <OverlayRow selected={selected} mark="●" markColor="green" label="hill-climb" meta="drive a metric" />
      </Overlay>
    ) as ReactElement;

  it("renders the selected row as a full-width bar carrying the label and meta", () => {
    const { lastFrame, unmount } = render(wrap(true));
    const frame = lastFrame() ?? "";
    expect(frame).toContain("› ● hill-climb");
    expect(frame).toContain("drive a metric");
    unmount();
  });

  it("renders an unselected row with the mark and label", () => {
    const { lastFrame, unmount } = render(wrap(false));
    const frame = lastFrame() ?? "";
    expect(frame).toContain("hill-climb");
    expect(frame).toContain("●");
    unmount();
  });
});
