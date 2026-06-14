import { select } from "./term/select.js";
import { askLine, askSecret, setEnv } from "./setup.js";

// Hermes-parity settings sections for `vanta setup` — Vanta's real knobs, each an
// arrow-key menu (Esc = skip). Maps Hermes's Agent/Tools/Display settings onto
// Vanta's VANTA_* env. Excludes Hermes-only trash (Nous Portal, Spotify, TTS,
// cloud terminal backends).

export type Choice = {
  label: string;
  value?: string; // env value to write (undefined = "keep current / skip" → no write)
  keyEnv?: string; // an extra secret env var to collect (e.g. SERPAPI_KEY)
  keyUrl?: string; // where to get that key
  urlEnv?: string; // an extra plain env var to collect (e.g. VANTA_SEARCH_URL)
  urlHint?: string;
};
export type SettingSection = {
  header: string;
  key: string; // the VANTA_* env var this section sets
  intro: string;
  choices: Choice[];
  custom?: boolean; // append "enter a custom value"
};

export const SETTINGS: SettingSection[] = [
  {
    header: "Vision model (auxiliary)",
    key: "VANTA_VISION_MODEL",
    intro: "  Used for image analysis when your main model isn't vision-capable.",
    choices: [
      { label: "Keep current / skip" },
      { label: "gpt-4o-mini — cheap (OpenAI)", value: "gpt-4o-mini" },
      { label: "gpt-4o — strong (OpenAI)", value: "gpt-4o" },
      { label: "claude-sonnet-4-6 (Anthropic)", value: "claude-sonnet-4-6" },
    ],
    custom: true,
  },
  {
    header: "Web search backend",
    key: "VANTA_SEARCH_PROVIDER",
    intro: "  How Vanta searches the web.",
    choices: [
      { label: "DuckDuckGo — keyless [default]", value: "ddg" },
      { label: "SearXNG — self-hosted, private", value: "searxng", urlEnv: "VANTA_SEARCH_URL", urlHint: "Your SearXNG instance URL" },
      { label: "SerpAPI — key", value: "serpapi", keyEnv: "SERPAPI_KEY", keyUrl: "https://serpapi.com/manage-api-key" },
      { label: "Brave Search — key", value: "brave", keyEnv: "BRAVE_KEY", keyUrl: "https://brave.com/search/api/" },
    ],
  },
  {
    header: "Agent — max iterations per turn",
    key: "VANTA_MAX_ITER",
    intro: "  Higher handles more complex multi-step tasks; costs more tokens.",
    choices: [
      { label: "50 — default", value: "50" },
      { label: "30 — lean / cheap", value: "30" },
      { label: "90 — complex exploration", value: "90" },
    ],
    custom: true,
  },
  {
    header: "Memory budget (per goal)",
    key: "VANTA_MEMORY_MAX_BLOCKS",
    intro: "  How many memory blocks Vanta keeps per goal (older ones stay in git).",
    choices: [
      { label: "50 — default", value: "50" },
      { label: "25 — lean", value: "25" },
      { label: "100 — generous", value: "100" },
    ],
    custom: true,
  },
  {
    header: "Display theme",
    key: "VANTA_THEME",
    intro: "  TUI color theme.",
    choices: [
      { label: "auto — match your terminal", value: "auto" },
      { label: "dark", value: "dark" },
      { label: "light", value: "light" },
    ],
  },
  {
    header: "Busy spinner style",
    key: "VANTA_SPINNER",
    intro: "  The animation shown while Vanta is thinking.",
    choices: [
      { label: "Keep default (braille)" },
      { label: "orbit", value: "orbit" },
      { label: "dots", value: "dots" },
      { label: "pulse", value: "pulse" },
      { label: "snake", value: "snake" },
      { label: "wave", value: "wave" },
    ],
  },
];

/** Collect any extra secret/url env vars a choice needs (e.g. SERPAPI_KEY). */
async function extraEnv(c: Choice): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (c.keyEnv) {
    if (c.keyUrl) console.log(`  Get a key: ${c.keyUrl}`);
    const k = await askSecret(`  Paste ${c.keyEnv} (hidden · empty = skip): `);
    if (k) out[c.keyEnv] = k;
  }
  if (c.urlEnv) {
    const u = await askLine(`  ${c.urlHint ?? c.urlEnv}: `);
    if (u) out[c.urlEnv] = u;
  }
  return out;
}

/** Resolve the env updates for a chosen menu index (+ any key/url it needs). null = no write. */
async function collectUpdates(s: SettingSection, i: number, customIdx: number): Promise<Record<string, string> | null> {
  if (s.custom && i === customIdx) {
    const v = await askLine(`  Custom ${s.key}: `);
    return v ? { [s.key]: v } : null;
  }
  const c = s.choices[i];
  if (!c || c.value === undefined) return null; // "keep current"
  return { [s.key]: c.value, ...(await extraEnv(c)) };
}

/** Run one settings section: arrow-select → write the chosen value(s). Esc = skip. */
export async function runSettingSection(repoRoot: string, s: SettingSection): Promise<void> {
  console.log(`\n  ◆ ${s.header}`);
  console.log(s.intro);
  const labels = [...s.choices.map((c) => c.label), ...(s.custom ? ["↳ enter a custom value"] : [])];
  const i = await select(`${s.header} (Esc = skip):`, labels, { canBack: true });
  if (i < 0) return;
  const updates = await collectUpdates(s, i, labels.length - 1);
  if (!updates) return;
  await setEnv(repoRoot, updates);
  console.log(`  ✓ set ${Object.keys(updates).join(", ")}`);
}
