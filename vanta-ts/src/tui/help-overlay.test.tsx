import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { HelpOverlay } from "./help-overlay.js";

describe("HelpOverlay", () => {
  it("renders key binding list", () => {
    const { lastFrame, unmount } = render(<HelpOverlay width={80} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Key bindings");
    expect(frame).toContain("Ctrl+A");
    expect(frame).toContain("Ctrl+U");
    expect(frame).toContain("! <cmd>");
    expect(frame).toContain("# <text>");
    unmount();
  });

  it("omits vim bindings when vimEnabled is false", () => {
    const { lastFrame, unmount } = render(<HelpOverlay width={80} vimEnabled={false} />);
    const frame = lastFrame() ?? "";
    expect(frame).not.toContain("Vim normal mode");
    unmount();
  });

  it("shows vim bindings when vimEnabled is true", () => {
    const { lastFrame, unmount } = render(<HelpOverlay width={80} vimEnabled />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Vim normal mode");
    expect(frame).toContain("enter insert mode");
    unmount();
  });
});
