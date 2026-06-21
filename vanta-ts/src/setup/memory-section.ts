import type { SettingSection, Choice } from "../setup-sections.js";

// SETUP-WIZARD-MEMORY — surface the memory backends + a couple of new feature
// toggles in `vanta setup`, mirroring the execution-backend section model: a
// section = a list of choices, each choice writes specific VANTA_* env keys.
//
// PURE: every export here is data or a pure function. The interactive prompt +
// secret collection stays the existing `runSettingSection`'s job — a choice that
// `needsKey` carries its secret env in `keyEnv`, so `runSettingSection`'s
// `extraEnv` collects it via the HIDDEN secret prompt (never written here).
//
// ACCURACY: only env vars that REALLY exist are referenced. The active backend is
// selected by `VANTA_MEMORY=<id>` (the resolver var in memory/provider.ts), NOT a
// `VANTA_MEMORY_PROVIDER` var (which does not exist). The per-backend vars are the
// adapters' real gates: `VANTA_MEM0_API_KEY` (mem0-adapter `mem0Enabled`),
// `VANTA_MEMANTO_URL` (memanto-adapter `memantoEnabled`). Drive reuses the
// existing google OAuth (no new auth var). Feature toggles map to real documented
// env (`VANTA_PROACTIVE`, `VANTA_GLIMMER`).
//
// SECURITY: the mem0 key is a SECRET — it is NEVER an argument or literal here.
// `needsKey` sets `keyEnv: VANTA_MEM0_API_KEY` so the existing hidden secret
// prompt collects it; this module only declares WHICH var to collect.

/** The resolver env var that selects the active memory backend (memory/provider.ts). */
export const MEMORY_BACKEND_KEY = "VANTA_MEMORY";

/**
 * One memory-backend choice for the wizard. `env` is the explicit multi-key write
 * for this choice (empty for local = no write); `needsKey` triggers the existing
 * hidden secret prompt for the backend's secret env; `note` is operator guidance.
 */
export type MemoryBackendChoice = {
  label: string;
  /** The backend id (matches the resolver / catalog id). */
  value: string;
  /** Explicit env keys this choice writes ({} for local = nothing). */
  env?: Record<string, string>;
  /** When true, the wizard collects a hidden secret env (mem0's API key). */
  needsKey?: boolean;
  /** Operator guidance shown alongside the choice. */
  note?: string;
};

/**
 * The memory-backend choice set. `local` is the default and writes NOTHING (the
 * built-in Brain — current behavior). drive/mem0/memanto each select their backend
 * via `VANTA_MEMORY=<id>` plus their real per-backend env:
 *   - drive   → reuses the existing google OAuth (run `vanta auth google`); no key var.
 *   - mem0    → needs the secret `VANTA_MEM0_API_KEY` (collected via the hidden prompt).
 *   - memanto → local-first REST endpoint `VANTA_MEMANTO_URL`; no secret.
 */
export const MEMORY_BACKEND_CHOICES: MemoryBackendChoice[] = [
  {
    label: "Local brain — on disk, no service [default]",
    value: "local",
    env: {},
  },
  {
    label: "Google Drive sync — back memory up to your Drive",
    value: "drive",
    env: { [MEMORY_BACKEND_KEY]: "drive" },
    note: "Reuses your google OAuth — run `vanta auth google` to authorize.",
  },
  {
    label: "mem0 — memory-as-a-service (needs an API key)",
    value: "mem0",
    env: { [MEMORY_BACKEND_KEY]: "mem0" },
    needsKey: true,
    note: "Paste your mem0 API key when prompted (hidden).",
  },
  {
    label: "memanto — local-first memory service",
    value: "memanto",
    env: { [MEMORY_BACKEND_KEY]: "memanto", VANTA_MEMANTO_URL: "http://localhost:8000" },
    note: "Local-first; point VANTA_MEMANTO_URL at your instance (default http://localhost:8000).",
  },
];

/** The secret env var mem0 collects via the hidden prompt (a key — never written here). */
export const MEM0_KEY_ENV = "VANTA_MEM0_API_KEY";
/** Where to get a mem0 API key. */
export const MEM0_KEY_URL = "https://app.mem0.ai";

/**
 * The env record a memory-backend choice writes (pure). local → {} (writes
 * nothing); the others → their declared `env` keys. The mem0 SECRET key is NOT
 * here — it is collected by the hidden secret prompt at section-run time, so this
 * record is always safe to log.
 */
export function memoryChoiceEnv(choice: MemoryBackendChoice): Record<string, string> {
  return { ...(choice.env ?? {}) };
}

/** Map a MemoryBackendChoice onto a setup-sections `Choice` (carries the secret-prompt wiring). */
function toSettingChoice(c: MemoryBackendChoice): Choice {
  const label = c.note ? `${c.label} — ${c.note}` : c.label;
  const choice: Choice = { label, env: memoryChoiceEnv(c) };
  if (c.needsKey) {
    choice.keyEnv = MEM0_KEY_ENV;
    choice.keyUrl = MEM0_KEY_URL;
  }
  return choice;
}

/**
 * Build the "Memory backend" setup-section descriptor (the SettingSection shape
 * `runSettingSection` runs). Heading "Memory backend" + the memory choices, keyed
 * on the resolver var. A declined/unset choice writes nothing (local default).
 */
export function buildMemorySection(): SettingSection {
  return {
    header: "Memory backend",
    key: MEMORY_BACKEND_KEY,
    intro: "  Where Vanta's memory lives. Local (the built-in brain) is the default.",
    choices: MEMORY_BACKEND_CHOICES.map(toSettingChoice),
  };
}

/**
 * A safe feature toggle for the wizard. Each maps to a REAL documented env var.
 * `on`/`off` are the explicit multi-key writes for enabling/disabling. `alwaysOn`
 * marks a toggle whose feature defaults ON (no enable write needed).
 */
export type FeatureToggleChoice = {
  label: string;
  /** The documented env var this toggle controls. */
  envVar: string;
  /** The env to write when enabling. */
  on: Record<string, string>;
  /** True when the feature is already on by default (e.g. startup tips). */
  alwaysOn?: boolean;
  /** One-line description of the feature. */
  note: string;
};

/**
 * A small set of safe feature toggles surfaced in setup. Each env var is real +
 * documented (.env.example / repl modules):
 *   - VANTA_PROACTIVE=1 — proactive heartbeat (advance queued work while you're away).
 *   - VANTA_GLIMMER=1   — glimmer (animated busy/title shimmer).
 *   - VANTA_TIPS        — startup tips; already ON by default (opt OUT with VANTA_TIPS=0).
 */
export const FEATURE_TOGGLE_CHOICES: FeatureToggleChoice[] = [
  {
    label: "Proactive heartbeat",
    envVar: "VANTA_PROACTIVE",
    on: { VANTA_PROACTIVE: "1" },
    note: "When idle and you're away, advance queued loop wakes on a strict throttle.",
  },
  {
    label: "Glimmer",
    envVar: "VANTA_GLIMMER",
    on: { VANTA_GLIMMER: "1" },
    note: "Animated shimmer on the busy/title text.",
  },
  {
    label: "Startup tips",
    envVar: "VANTA_TIPS",
    on: { VANTA_TIPS: "1" },
    alwaysOn: true,
    note: "Feature tips at launch — already on (set VANTA_TIPS=0 to opt out).",
  },
];
