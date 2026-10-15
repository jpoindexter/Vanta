// Responsive horizontal gutter for primary content bodies (settings right side,
// skills, artifacts, command center / sessions). Ratio-based so it scales with
// the window, but clamped so it never collapses on narrow widths or runs away
// on ultrawide displays. Headers/tabs intentionally keep their own tighter
// padding.
//
// NOTE: these must stay literal strings — Tailwind's scanner only picks up
// complete class names, so do not build them via template interpolation.
export const PAGE_INSET_X = 'px-[clamp(1.25rem,4vw,4rem)]'

// Matching negative inline-margin to bleed an element (e.g. a sticky header bar)
// out to the gutter edges before re-applying PAGE_INSET_X.
export const PAGE_INSET_NEG_X = '-mx-[clamp(1.25rem,4vw,4rem)]'

// Readable cap for overlay "inner page" bodies (settings, command center). Wide
// enough to breathe, tight enough that content doesn't sprawl on ultrawide
// displays. Pair with `mx-auto w-full` to center within the pane. Literal string
// for Tailwind's scanner (see PAGE_INSET_X note).
export const PAGE_MAX_W = 'max-w-[75rem]'

// Shell tiers (flow-app-shell collapse order). The sidebar docks at full width
// from SHELL_FULL_MIN_WIDTH_PX up; between SHELL_RAIL_MIN_WIDTH_PX and that it
// stays docked as a 56px icon rail while every other collapsible pane (the
// workbench) leaves the grid and overlays; under SHELL_RAIL_MIN_WIDTH_PX the
// sidebar leaves the grid too and opens as a drawer. Main keeps at least
// MAIN_MIN_WIDTH_PX at every tier. Single source of truth for the collapse
// points; vanta-shell.css repeats the same numbers in its media queries.
export const SHELL_FULL_MIN_WIDTH_PX = 1280
export const SHELL_RAIL_MIN_WIDTH_PX = 1024
export const MAIN_MIN_WIDTH_PX = 480
export const SIDEBAR_RAIL_WIDTH_PX = 56
export const SIDEBAR_DEFAULT_WIDTH_PX = 275
export const SIDEBAR_MIN_WIDTH_PX = 240
export const SIDEBAR_MAX_WIDTH_PX = 520

// `max-width` is inclusive: shave a hair so an exactly-1280px window is full.
// Panes that declare `collapsible` leave the grid under this width.
export const SIDEBAR_COLLAPSE_MEDIA_QUERY = `(max-width: ${SHELL_FULL_MIN_WIDTH_PX - 0.02}px)`
// The sidebar itself leaves the grid (drawer) under this width.
export const SIDEBAR_DRAWER_MEDIA_QUERY = `(max-width: ${SHELL_RAIL_MIN_WIDTH_PX - 0.02}px)`
