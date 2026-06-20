// Pure clickable-region registry + hit testing.
//
// A Region is a rectangular box in terminal-cell space (0-based, matching the
// coordinates parse.ts emits) carrying the id of the element it stands for.
// hitTest returns the TOPMOST region whose box contains a point — "topmost"
// being the LAST region registered, so a later-mounted overlay wins over the
// region it covers (matching paint order: last drawn is on top).
//
// This is the HIT-TEST stage of the parse -> hit-test -> dispatch pipeline. It
// stays pure: the live wiring (Ink elements measuring their own bounds and
// registering them) is the documented boundary handled elsewhere.

export type Region = {
  /** Element id this box belongs to — fed to focus + click dispatch. */
  id: string;
  /** Left edge, 0-based column (inclusive). */
  x: number;
  /** Top edge, 0-based row (inclusive). */
  y: number;
  /** Width in cells; a box covers columns x .. x+w-1. */
  w: number;
  /** Height in cells; a box covers rows y .. y+h-1. */
  h: number;
};

/** True when point (px,py) lies inside the region's half-open box. */
export function containsPoint(region: Region, px: number, py: number): boolean {
  if (region.w <= 0 || region.h <= 0) return false;
  return px >= region.x && px < region.x + region.w && py >= region.y && py < region.y + region.h;
}

/**
 * Return the topmost region whose box contains (x,y), or null if none do.
 * On overlap the LAST-registered region wins (paint order: last drawn is on top).
 */
export function hitTest(regions: readonly Region[], x: number, y: number): Region | null {
  for (let i = regions.length - 1; i >= 0; i--) {
    const region = regions[i]!;
    if (containsPoint(region, x, y)) return region;
  }
  return null;
}
