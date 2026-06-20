import { describe, expect, it, vi } from "vitest";
import { dispatchClick, type DispatchDeps } from "./dispatch.js";
import { type Region } from "./hit-test.js";
import type { FocusTargetSpec } from "../focus.js";
import type { MouseEvent } from "./parse.js";

const press = (x: number, y: number): MouseEvent => ({ button: "left", action: "press", x, y });

const box = (id: string, x: number, y: number, w: number, h: number): Region => ({ id, x, y, w, h });

const focusTargets: FocusTargetSpec[] = [
  { id: "composer" },
  { id: "approval-allow" },
  { id: "approval-deny" },
];

function deps(over: Partial<DispatchDeps> = {}): DispatchDeps {
  return {
    regions: [box("approval-allow", 0, 0, 5, 1), box("approval-deny", 0, 1, 5, 1)],
    handlers: {},
    focusTargets,
    current: "composer",
    ...over,
  };
}

describe("dispatchClick", () => {
  it("calls the matched region's handler and reports it as handled", () => {
    const allow = vi.fn();
    const result = dispatchClick(press(2, 0), deps({ handlers: { "approval-allow": allow } }));
    expect(allow).toHaveBeenCalledTimes(1);
    expect(result.handled).toBe(true);
    expect(result.hit?.id).toBe("approval-allow");
  });

  it("moves focus to the clicked region when its id is a focus target", () => {
    const result = dispatchClick(press(2, 1), deps());
    expect(result.focus).toBe("approval-deny");
  });

  it("calls only the handler for the region that was hit", () => {
    const allow = vi.fn();
    const deny = vi.fn();
    dispatchClick(press(2, 1), deps({ handlers: { "approval-allow": allow, "approval-deny": deny } }));
    expect(deny).toHaveBeenCalledTimes(1);
    expect(allow).not.toHaveBeenCalled();
  });

  it("a miss calls nothing and leaves focus unchanged", () => {
    const allow = vi.fn();
    const result = dispatchClick(press(50, 50), deps({ handlers: { "approval-allow": allow } }));
    expect(allow).not.toHaveBeenCalled();
    expect(result.handled).toBe(false);
    expect(result.hit).toBeNull();
    expect(result.focus).toBe("composer");
  });

  it("dispatches a handler even when the region is not a focus target (focus stays)", () => {
    const onClick = vi.fn();
    const result = dispatchClick(
      press(1, 0),
      deps({ regions: [box("overlay-list", 0, 0, 5, 1)], handlers: { "overlay-list": onClick }, focusTargets: [{ id: "composer" }] }),
    );
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(result.handled).toBe(true);
    expect(result.focus).toBe("composer"); // not in focusTargets -> unchanged
  });

  it("reports a hit but handled=false when the region has no handler", () => {
    const result = dispatchClick(press(2, 0), deps());
    expect(result.hit?.id).toBe("approval-allow");
    expect(result.handled).toBe(false);
    expect(result.focus).toBe("approval-allow"); // focus still moves on a hit
  });

  it("ignores non-click events (release, move, scroll, non-left button)", () => {
    const allow = vi.fn();
    const base = deps({ handlers: { "approval-allow": allow } });
    for (const ev of [
      { button: "left", action: "release", x: 2, y: 0 } as MouseEvent,
      { button: "left", action: "move", x: 2, y: 0 } as MouseEvent,
      { button: "scroll-up", action: "press", x: 2, y: 0 } as MouseEvent,
      { button: "right", action: "press", x: 2, y: 0 } as MouseEvent,
    ]) {
      const result = dispatchClick(ev, base);
      expect(result.handled).toBe(false);
      expect(result.focus).toBe("composer");
    }
    expect(allow).not.toHaveBeenCalled();
  });

  it("does not move focus to a disabled focus target", () => {
    const result = dispatchClick(
      press(2, 0),
      deps({ focusTargets: [{ id: "composer" }, { id: "approval-allow", enabled: false }] }),
    );
    expect(result.hit?.id).toBe("approval-allow");
    expect(result.focus).toBe("composer"); // disabled -> not focusable -> unchanged
  });
});
