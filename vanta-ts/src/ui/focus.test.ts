import { describe, expect, it, vi } from "vitest";
import {
  focusIndicator,
  focusableTargets,
  handleFocusKey,
  nextFocus,
  prevFocus,
  type FocusTarget,
} from "./focus.js";

const targets = (ids: FocusTarget[]) => ids.map((id) => ({ id }));

describe("focus traversal", () => {
  it("next focus wraps", () => {
    expect(nextFocus(targets(["composer", "approval-allow", "approval-deny"]), "composer")).toBe("approval-allow");
    expect(nextFocus(targets(["composer", "approval-allow", "approval-deny"]), "approval-deny")).toBe("composer");
  });

  it("previous focus wraps", () => {
    expect(prevFocus(targets(["composer", "approval-allow", "approval-deny"]), "composer")).toBe("approval-deny");
    expect(prevFocus(targets(["composer", "approval-allow", "approval-deny"]), "approval-allow")).toBe("composer");
  });

  it("skips disabled or hidden targets", () => {
    const list = [
      { id: "composer" as const },
      { id: "approval-allow" as const, enabled: false },
      { id: "approval-deny" as const },
    ];
    expect(focusableTargets(list)).toEqual(["composer", "approval-deny"]);
    expect(nextFocus(list, "composer")).toBe("approval-deny");
  });

  it("has stable empty and single-target behavior", () => {
    expect(nextFocus([], "composer")).toBe("composer");
    expect(prevFocus([{ id: "composer" }], "composer")).toBe("composer");
  });

  it("global focus keys cycle forward/backward and preserve shift-tab mode cycle with only composer", () => {
    const setFocus = vi.fn();
    const cycleMode = vi.fn();
    handleFocusKey({ tab: true }, { current: "composer", targets: targets(["composer", "approval-deny"]), setFocus, cycleMode });
    expect(setFocus).toHaveBeenCalledWith("approval-deny");
    handleFocusKey({ tab: true, shift: true }, { current: "approval-deny", targets: targets(["composer", "approval-deny"]), setFocus, cycleMode });
    expect(setFocus).toHaveBeenLastCalledWith("composer");
    handleFocusKey({ tab: true, shift: true }, { current: "composer", targets: targets(["composer"]), setFocus, cycleMode });
    expect(cycleMode).toHaveBeenCalled();
  });

  it("returns a visible focus indicator only when focused", () => {
    expect(focusIndicator(true)).toBe("❯");
    expect(focusIndicator(false)).toBe(" ");
  });
});
