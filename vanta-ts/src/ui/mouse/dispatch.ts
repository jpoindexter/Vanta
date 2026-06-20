// Pure click dispatch — the DISPATCH stage of parse -> hit-test -> dispatch.
//
// Given a parsed MouseEvent, the registered clickable regions, and a handler
// map keyed by region id, dispatchClick:
//   1. hit-tests the click point against the regions (topmost wins),
//   2. calls the matched region's handler (if one is registered),
//   3. composes with ui/focus.ts: when the matched region's id names a focus
//      target, that target becomes the new focus.
// A click that hits nothing calls no handler and leaves focus unchanged.
//
// It stays pure: handlers + the current focus are injected, and the result is a
// value describing what changed (errors-as-values — never throws). Live wiring
// of focus state into the app is the documented boundary handled elsewhere.

import { hitTest, type Region } from "./hit-test.js";
import { isFocusable, type FocusTarget, type FocusTargetSpec } from "../focus.js";
import type { MouseEvent } from "./parse.js";

/** Handler invoked when a region is clicked. */
export type ClickHandler = (event: MouseEvent, region: Region) => void;

/** Map of region id -> click handler. Regions without an entry are inert. */
export type ClickHandlers = Record<string, ClickHandler | undefined>;

export type DispatchDeps = {
  regions: readonly Region[];
  handlers: ClickHandlers;
  /** Focus targets the click may move focus to (composes with ui/focus.ts). */
  focusTargets: FocusTargetSpec[];
  /** Current focus, returned unchanged when the click changes nothing. */
  current: FocusTarget;
};

export type DispatchResult = {
  /** The region the click landed on, or null on a miss. */
  hit: Region | null;
  /** True when a handler was invoked. */
  handled: boolean;
  /** Focus after the click — moved only when the hit region is a focus target. */
  focus: FocusTarget;
};

/** A click is a left-button press; other events never trigger a click dispatch. */
function isClick(event: MouseEvent): boolean {
  return event.action === "press" && event.button === "left";
}

/**
 * Dispatch a mouse event against the clickable regions. Returns the matched
 * region (or null), whether a handler ran, and the resulting focus id.
 */
export function dispatchClick(event: MouseEvent, deps: DispatchDeps): DispatchResult {
  if (!isClick(event)) {
    return { hit: null, handled: false, focus: deps.current };
  }

  const hit = hitTest(deps.regions, event.x, event.y);
  if (!hit) {
    return { hit: null, handled: false, focus: deps.current };
  }

  const handler = deps.handlers[hit.id];
  if (handler) handler(event, hit);

  const focus = nextFocusFor(hit.id, deps);
  return { hit, handled: handler !== undefined, focus };
}

/** Move focus to the hit region only if its id is a usable focus target. */
function nextFocusFor(id: string, deps: DispatchDeps): FocusTarget {
  const target = id as FocusTarget;
  return isFocusable(target, deps.focusTargets) ? target : deps.current;
}
