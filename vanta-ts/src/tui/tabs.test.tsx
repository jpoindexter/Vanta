import { describe, it, expect } from "vitest";
import { render } from "./test-render.js";
import { Tabs } from "./tabs.js";

describe("Tabs", () => {
  it("renders every tab label", () => {
    const { lastFrame, unmount } = render(<Tabs tabs={["Provider", "Model"]} active={0} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Provider");
    expect(frame).toContain("Model");
    unmount();
  });

  it("renders both labels regardless of which is active", () => {
    const { lastFrame, unmount } = render(<Tabs tabs={["Provider", "Model"]} active={1} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Provider");
    expect(frame).toContain("Model");
    unmount();
  });

  it("separates tabs with a middot", () => {
    const { lastFrame, unmount } = render(<Tabs tabs={["A", "B", "C"]} active={0} />);
    expect(lastFrame() ?? "").toContain("·");
    unmount();
  });
});
