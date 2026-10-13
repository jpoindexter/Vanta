import { afterEach, describe, expect, it, vi } from "vitest";
import { NARROW_MAX_PX, startsNarrow } from "./narrow-viewport.js";

afterEach(() => { vi.unstubAllGlobals(); });

function stubWindow(matches: boolean) {
  const matchMedia = vi.fn((query: string) => ({ matches: matches && query === `(max-width: ${NARROW_MAX_PX}px)` }));
  vi.stubGlobal("window", { matchMedia });
  return matchMedia;
}

describe("startsNarrow", () => {
  it("is true when the window opens at or below the overlay breakpoint", () => {
    const matchMedia = stubWindow(true);
    expect(startsNarrow()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith("(max-width: 760px)");
  });

  it("is false on a wide window", () => {
    stubWindow(false);
    expect(startsNarrow()).toBe(false);
  });

  it("is false when there is no window or no matchMedia, so server rendering keeps the sidebar open", () => {
    vi.stubGlobal("window", {});
    expect(startsNarrow()).toBe(false);
  });
});
