// VANTA-TEAMMATE-COLOR — a stable, distinct color per teammate/swarm worker so
// concurrent workers are visually distinguishable in the fleet/swarm UI.
//
// PURE + presentation-only: this module assigns an Ink color to an agent id and
// does NOT touch the render layer. The NAMED wire-in point is the live spinner
// tree: ui/teammate-tree.ts builds one TreeRow per running teammate
// (buildTeammateTree → TreeRow{ name, index, … }). The renderer would color each
// teammate row's name/branch with teammateColor(agent.id) (or, for a whole
// snapshot at once, assignTeammateColors(running.map(a => a.id))) so the same
// worker always reads as the same color across frames. ui/task-rows.ts is the
// same shape for the /agents panel (toTaskRow keyed by WorkerTask.workerId).
//
// All colors are literal Ink color strings (the codebase uses literal Ink colors
// per the no-theme decision — see DECISIONS 2026-06-17). The palette is the set
// of terminal-safe base + bright ANSI names Ink accepts, chosen to be visually
// distinct from each other and from the mono-default foreground.

/**
 * Terminal-safe, visually-distinct Ink colors for teammates. Ordered so that
 * adjacent palette indices read as clearly different hues — base ANSI colors
 * first, then their bright variants. Excludes white/gray/black (the default
 * foreground role) so a teammate color never blends into normal text.
 */
export const TEAMMATE_PALETTE = [
  "cyan",
  "green",
  "yellow",
  "magenta",
  "blue",
  "red",
  "cyanBright",
  "greenBright",
  "yellowBright",
  "magentaBright",
  "blueBright",
  "redBright",
] as const;

/** A color drawn from {@link TEAMMATE_PALETTE} — a valid Ink color string. */
export type TeammateColor = (typeof TEAMMATE_PALETTE)[number];

/** First palette color — the total fallback for a provably-in-range lookup that
 * the compiler can't narrow under noUncheckedIndexedAccess. */
const FIRST_COLOR: TeammateColor = TEAMMATE_PALETTE[0];

/** Palette color at an index, total under noUncheckedIndexedAccess. The index is
 * always in range (modulo / bounded scan); the `?? FIRST_COLOR` only satisfies
 * the type checker and is never reached at runtime. */
function colorAt(index: number): TeammateColor {
  return TEAMMATE_PALETTE[index] ?? FIRST_COLOR;
}

/**
 * Stable, well-distributed hash of an id → 32-bit unsigned int. FNV-1a: a
 * single-pass, dependency-free string hash with good avalanche, so similar ids
 * (e.g. "worker-1" / "worker-2") land on different palette indices instead of
 * clustering. Pure + total — same input always yields the same output.
 */
function hashId(agentId: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < agentId.length; i++) {
    hash ^= agentId.charCodeAt(i);
    // FNV prime multiply via shifts/adds, kept in 32-bit unsigned space.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Stable palette INDEX for an agent id. Pure + total: the same id ALWAYS maps to
 * the same index, distributed across the palette by the id's hash. An empty id
 * is handled (hashes to a fixed index, never throws / NaN).
 */
export function teammateColorIndex(agentId: string): number {
  return hashId(agentId) % TEAMMATE_PALETTE.length;
}

/**
 * Stable Ink color for an agent id. Pure + total: same id → same color always,
 * well-distributed across {@link TEAMMATE_PALETTE}. Presentation-only.
 */
export function teammateColor(agentId: string): TeammateColor {
  return colorAt(teammateColorIndex(agentId));
}

/**
 * Assign a distinct color to each id where possible. Pure + total. Walks the ids
 * in order, preferring each id's stable hash color but stepping to the next free
 * palette slot on a collision so a small fleet gets all-distinct colors; once the
 * palette is exhausted (more ids than colors) it cycles, reusing colors in
 * palette order. Duplicate ids in the input collapse to a single map entry (same
 * id → same color). Returns a Map keyed by id in first-seen order.
 */
export function assignTeammateColors(agentIds: readonly string[]): Map<string, TeammateColor> {
  const assigned = new Map<string, TeammateColor>();
  const used = new Set<number>();
  let cycleCursor = 0; // next palette slot once every color is in use
  for (const id of agentIds) {
    if (assigned.has(id)) continue; // duplicate id keeps its first color
    const index = nextFreeIndex(teammateColorIndex(id), used, cycleCursor);
    used.add(index);
    assigned.set(id, colorAt(index));
    if (used.size >= TEAMMATE_PALETTE.length) {
      used.clear(); // palette exhausted — start a fresh cycle
      cycleCursor = (index + 1) % TEAMMATE_PALETTE.length;
    }
  }
  return assigned;
}

/**
 * First free palette index at/after `preferred`, scanning circularly. If every
 * slot is taken (can't happen given the caller resets `used` on exhaustion, but
 * kept total) it falls back to the cycle cursor. Pure helper.
 */
function nextFreeIndex(preferred: number, used: Set<number>, cycleCursor: number): number {
  const len = TEAMMATE_PALETTE.length;
  for (let step = 0; step < len; step++) {
    const index = (preferred + step) % len;
    if (!used.has(index)) return index;
  }
  return cycleCursor % len;
}
