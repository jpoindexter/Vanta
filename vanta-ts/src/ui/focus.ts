export type FocusTarget =
  | "composer"
  | "slash-palette"
  | "approval-allow"
  | "approval-always"
  | "approval-deny"
  | "approval-never"
  | "overlay-list"
  | "overlay-close"
  | "prompt-suggestions";

export type FocusTargetSpec = { id: FocusTarget; enabled?: boolean };

export type FocusKey = { tab?: boolean; shift?: boolean };

export function focusableTargets(targets: FocusTargetSpec[]): FocusTarget[] {
  return targets.filter((t) => t.enabled !== false).map((t) => t.id);
}

export function isFocusable(target: FocusTarget, targets: FocusTargetSpec[]): boolean {
  return focusableTargets(targets).includes(target);
}

export function nextFocus(targets: FocusTargetSpec[], current: FocusTarget): FocusTarget {
  return moveFocus(targets, current, 1);
}

export function prevFocus(targets: FocusTargetSpec[], current: FocusTarget): FocusTarget {
  return moveFocus(targets, current, -1);
}

export function focusIndicator(focused: boolean): "❯" | " " {
  return focused ? "❯" : " ";
}

export function handleFocusKey(
  key: FocusKey,
  deps: { current: FocusTarget; cycleMode: () => void; setFocus: (target: FocusTarget) => void; targets: FocusTargetSpec[] },
): boolean {
  if (!key.tab) return false;
  const enabled = focusableTargets(deps.targets);
  if (key.shift && enabled.length <= 1 && enabled[0] === "composer") {
    deps.cycleMode();
    return true;
  }
  deps.setFocus(key.shift ? prevFocus(deps.targets, deps.current) : nextFocus(deps.targets, deps.current));
  return true;
}

function moveFocus(targets: FocusTargetSpec[], current: FocusTarget, step: 1 | -1): FocusTarget {
  const enabled = focusableTargets(targets);
  if (enabled.length <= 1) return enabled[0] ?? current;
  const idx = enabled.indexOf(current);
  const from = idx >= 0 ? idx : 0;
  return enabled[(from + step + enabled.length) % enabled.length]!;
}
