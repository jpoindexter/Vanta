// Named glyph constants for the TUI design language.
// Centralising them here lets themes and components stay readable while keeping
// the visual vocabulary in one place.

export const GLYPHS = {
  /** Assistant-turn marker — the recording dot. */
  dot: "⏺",
  /** Prompt pointer — chevron used in user-turn labels and selections. */
  pointer: "❯",
  /** Thinking / compaction boundary asterisk. */
  asterisk: "✻",
  /** Success state. */
  check: "✔",
  /** Error / blocked state. */
  cross: "✘",
  /** Run / execute indicator. */
  play: "▶",
  /** Empty / pending circle. */
  ring: "○",
  /** Half-filled circle — partial / in-progress. */
  halfRing: "◐",
  /** Filled circle — used for ready state, selected marks. */
  bullet: "●",
  /** Circled dot — alternative selected mark. */
  circledDot: "◉",
  /** Separator used between hint parts in the status bar. */
  mid: "·",
  /** Thin horizontal rule (narrower than — for inline use). */
  dash: "─",
} as const;

export type GlyphKey = keyof typeof GLYPHS;

/** Growing-asterisk frames: ✶ → ✸ → ✻ → ✸ → ✶ — used in the busy spinner. */
export const ASTERISK_FRAMES = ["✶", "✸", "✻", "✸", "✶", "✻"] as const;

/**
 * Distinct frames for the STALLED spinner — a slow hollow→half→hollow pulse,
 * visually different from the growing asterisk so a stuck/slow turn reads as
 * a different state at a glance (VANTA-SPINNER-STALLED).
 */
export const STALLED_FRAMES = ["○", "◔", "◑", "◕", "●", "◕", "◑", "◔"] as const;

/** Verb list cycled alongside the growing-asterisk spinner (CC-style busy label). */
export const SPINNER_VERBS = [
  "thinking",
  "analyzing",
  "reasoning",
  "working",
  "processing",
] as const;
