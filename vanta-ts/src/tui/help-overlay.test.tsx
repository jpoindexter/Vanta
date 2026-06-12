import { describe, it, expect } from "vitest";
import { render } from "./test-render.js";
import { HelpOverlay } from "./help-overlay.js";

describe("HelpOverlay", () => {
  it("renders the registry-driven key binding list", () => {
    const { lastFrame, unmount } = render(<HelpOverlay width={80} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Key bindings");
    // chords now render via formatChord (^A, ^U) from DEFAULT_BINDINGS
    expect(frame).toContain("^A");
    expect(frame).toContain("^U");
    expect(frame).toContain("cursor to line start");
    expect(frame).toContain("exit Vanta"); // a global registry binding
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
