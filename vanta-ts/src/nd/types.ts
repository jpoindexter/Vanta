// ND executive-function gate engine — types.
//
// The full neurodivergent support set as FIRST-CLASS, per-user-configurable
// product behaviors (the way the assistant's own ND skills shape how IT works,
// but FOR the user). One engine; each gate is a small pure rule over a per-turn
// signal snapshot + its own tiny accumulator. (ND-EF-GATE-ENGINE.)

/** The nine executive-function gates. */
export type GateId =
  | "research"
  | "complexity"
  | "task-initiation"
  | "hyperfocus"
  | "time-blindness"
  | "closure"
  | "velocity"
  | "set-shift"
  | "inhibit";

/** Everything a gate may inspect about the turn just completed. Pure data. */
export type EfSignals = {
  /** 1-based turn number this session. */
  turnIndex: number;
  /** The user message that started this turn ("" if none / a resend). */
  lastUserMessage: string;
  /** Tool names called this turn (in call order). */
  toolNames: string[];
  /** The assistant emitted visible text this turn. */
  producedText: boolean;
  /** A file-writing tool ran this turn (write_file / edit_file). */
  wroteFiles: boolean;
  /** A git commit happened this turn. */
  committed: boolean;
  /** Active goal text, or null. */
  activeGoalText: string | null;
  /** Minutes elapsed since the session started. */
  elapsedMin: number;
  /** 7-day capture / ship counts for velocity (0 when unknown). */
  captures: number;
  ships: number;
};

/** A gate's tiny private accumulator across turns. */
export type GateMemory = {
  /** The streak/counter the gate accumulates. */
  n: number;
  /** Turn index the gate last fired on (throttles re-firing). */
  last: number;
  /** What's being repeated (tool/area), when relevant. */
  mark: string | null;
};

export const EMPTY_MEMORY: GateMemory = { n: 0, last: 0, mark: null };

/** A single executive-function gate — a pure rule. */
export type EfGate = {
  id: GateId;
  /** Short human label for `/nd` + nudges. */
  label: string;
  /** On by default for a new user? */
  defaultEnabled: boolean;
  /** Default trigger threshold (turns / minutes / ratio per gate; 0 = disabled). */
  defaultThreshold: number;
  /** Pure: advance the accumulator and maybe emit a nudge. */
  evaluate: (s: EfSignals, prev: GateMemory, threshold: number) => { next: GateMemory; nudge: string | null };
};

/** Per-gate user configuration. */
export type GateConfig = { enabled: boolean; threshold: number };

/** The per-user gate config: gate config keyed by gate id. */
export type NdConfig = Record<GateId, GateConfig>;

/** How much the assistant should say per turn (drives nd-sensory-load). */
export type OutputDensity = "minimal" | "balanced" | "rich";

/** Sensory load tolerance — caps decoration/emoji/visual noise in output. */
export type SensoryLoad = "low" | "medium" | "high";

/** How time support is surfaced (ranges vs single points; explicit checkpoints). */
export type TimeSupportStyle = "ranges" | "points" | "off";

/** All valid values per preference, for parse/validate at the command + persistence boundary. */
export const OUTPUT_DENSITIES = ["minimal", "balanced", "rich"] as const;
export const SENSORY_LOADS = ["low", "medium", "high"] as const;
export const TIME_SUPPORT_STYLES = ["ranges", "points", "off"] as const;

/**
 * Non-gate per-user ND preferences. These are not executive-function gates —
 * they shape HOW the assistant communicates (density, sensory noise) and how it
 * surfaces time, the way the EF gates shape WHEN it nudges. A renderer / the
 * prompt reads these; they persist alongside the gate config.
 */
export type NdPreferences = {
  outputDensity: OutputDensity;
  sensoryLoad: SensoryLoad;
  timeSupport: TimeSupportStyle;
};

/**
 * The complete per-user ND profile: the EF gate config that drives the engine
 * plus the communication/time preferences. This is the persisted unit.
 */
export type NdProfile = {
  gates: NdConfig;
  prefs: NdPreferences;
};

/** The engine's running state: each gate's accumulator. */
export type EfState = Record<GateId, GateMemory>;
