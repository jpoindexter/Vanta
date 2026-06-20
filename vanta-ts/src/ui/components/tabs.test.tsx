import { createElement as h, useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderUi, tick, waitForFrame, waitUntil } from "../test-render.js";
import { Tabs, type Tab } from "./tabs.js";

const TABS: Tab[] = [
  { id: "a", label: "Kernel" },
  { id: "b", label: "Goals" },
  { id: "c", label: "Loops" },
];

/** A controlled host: owns the active index so → / ← actually move the tab. */
function Host(props: { start?: number; onChange?: (i: number) => void }) {
  const [active, setActive] = useState(props.start ?? 0);
  return h(Tabs, {
    tabs: TABS,
    active,
    onChange: (i: number) => { setActive(i); props.onChange?.(i); },
  });
}

describe("Tabs", () => {
  it("renders every tab label", async () => {
    const inst = renderUi(h(Tabs, { tabs: TABS, active: 0 }));
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("Kernel");
    expect(frame).toContain("Goals");
    expect(frame).toContain("Loops");
    inst.unmount();
  });

  it("moves the active tab right on the right arrow", async () => {
    const onChange = vi.fn();
    const inst = renderUi(h(Host, { start: 0, onChange }));
    await tick();
    inst.input("\x1b[C"); // right arrow
    await waitUntil(() => onChange.mock.calls.length > 0);
    expect(onChange).toHaveBeenCalledWith(1);
    inst.unmount();
  });

  it("moves the active tab left on the left arrow", async () => {
    const onChange = vi.fn();
    const inst = renderUi(h(Host, { start: 2, onChange }));
    await tick();
    inst.input("\x1b[D"); // left arrow
    await waitUntil(() => onChange.mock.calls.length > 0);
    expect(onChange).toHaveBeenCalledWith(1);
    inst.unmount();
  });

  it("does not move past the last tab", async () => {
    const onChange = vi.fn();
    const inst = renderUi(h(Host, { start: 2, onChange }));
    await tick();
    inst.input("\x1b[C"); // right arrow at the last tab
    await tick();
    await tick();
    expect(onChange).not.toHaveBeenCalled();
    inst.unmount();
  });

  it("highlights the active tab (inverse render around its label)", async () => {
    // Move from Kernel to Goals, then assert Goals is the highlighted label by
    // waiting for the post-move frame. The active label is wrapped in spaces.
    const inst = renderUi(h(Host, { start: 0 }));
    await tick();
    inst.input("\x1b[C");
    const frame = await waitForFrame(inst, "Goals");
    expect(frame).toContain(" Goals ");
    inst.unmount();
  });
});
