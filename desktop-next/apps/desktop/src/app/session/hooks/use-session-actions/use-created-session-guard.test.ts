import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCreatedSessionGuard } from "./use-created-session-guard";

function options() {
  return {
    creatingSessionRef: { current: false },
    navigate: vi.fn(),
    routedSessionId: "A" as string | null,
    selectedStoredSessionId: "A" as string | null,
    selectedStoredSessionIdRef: { current: "A" as string | null },
  };
}

describe("created-session route guard", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("reads live pending state without creating authority or changing getter identity", () => {
    const props = options();
    const { result, rerender } = renderHook(useCreatedSessionGuard, {
      initialProps: props,
    });
    const pending = result.current.hasPendingCreatedSession;
    expect(pending()).toBe(false);
    act(() => result.current.armPendingCreatedSession("B"));
    expect(pending()).toBe(true);
    expect(props.creatingSessionRef.current).toBe(false);
    props.creatingSessionRef.current = true;
    rerender({ ...props });
    expect(result.current.hasPendingCreatedSession).toBe(pending);
    act(() => result.current.releaseCreatingSessionGuard());
    expect(pending()).toBe(false);
    expect(props.creatingSessionRef.current).toBe(false);
  });

  it("replaces the earlier timer and navigates only for the current pending session", () => {
    const props = options();
    props.creatingSessionRef.current = true;
    const { result } = renderHook(useCreatedSessionGuard, {
      initialProps: props,
    });
    act(() => result.current.armPendingCreatedSession("first"));
    act(() => vi.advanceTimersByTime(1_500));
    act(() => result.current.armPendingCreatedSession("second"));
    act(() => vi.advanceTimersByTime(1_500));
    expect(props.navigate).not.toHaveBeenCalled();
    expect(result.current.hasPendingCreatedSession()).toBe(true);
    act(() => vi.advanceTimersByTime(1_499));
    expect(props.navigate).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(props.navigate).toHaveBeenCalledExactlyOnceWith("/second", {
      replace: true,
    });
    expect(props.creatingSessionRef.current).toBe(false);
    expect(result.current.hasPendingCreatedSession()).toBe(false);
  });

  it("cancels the timer on unmount without resetting the external owner ref", () => {
    const props = options();
    props.creatingSessionRef.current = true;
    const { result, unmount } = renderHook(useCreatedSessionGuard, {
      initialProps: props,
    });
    act(() => result.current.armPendingCreatedSession("B"));
    unmount();
    act(() => vi.advanceTimersByTime(3_000));
    expect(props.navigate).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(props.creatingSessionRef.current).toBe(true);
  });

  it("settles when only selection catches up to an already-matching route", () => {
    const props = options();
    props.creatingSessionRef.current = true;
    props.routedSessionId = "B";
    const { result, rerender } = renderHook(useCreatedSessionGuard, {
      initialProps: props,
    });
    act(() => result.current.armPendingCreatedSession("B"));
    expect(result.current.hasPendingCreatedSession()).toBe(true);
    props.selectedStoredSessionIdRef.current = "B";
    rerender({ ...props, selectedStoredSessionId: "B" });
    expect(result.current.hasPendingCreatedSession()).toBe(false);
    expect(props.creatingSessionRef.current).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
