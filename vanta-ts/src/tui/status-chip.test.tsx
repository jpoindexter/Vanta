import { describe, it, expect } from "vitest";
import { render } from "./test-render.js";
import { StatusChip } from "./status-chip.js";

describe("StatusChip", () => {
  it("renders the label verbatim (no padding) so callers control width", () => {
    const { lastFrame, unmount } = render(<StatusChip label="● ready" bg="green" />);
    expect(lastFrame() ?? "").toContain("● ready");
    unmount();
  });

  it("renders a mode chip label", () => {
    const { lastFrame, unmount } = render(<StatusChip label=" ⚡auto" bg="yellow" />);
    expect(lastFrame() ?? "").toContain("⚡auto");
    unmount();
  });
});
