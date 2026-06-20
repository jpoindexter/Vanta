import { GATES } from "../nd/gates.js";
import {
  loadNdProfile,
  saveNdConfig,
  saveNdPreferences,
  invalidateNdConfig,
  isGateId,
  ndEngineEnabled,
} from "../nd/profile.js";
import { setGateEnabled, setGateThreshold, setNdPreference } from "../nd/engine.js";
import {
  OUTPUT_DENSITIES,
  SENSORY_LOADS,
  TIME_SUPPORT_STYLES,
  type NdConfig,
  type NdPreferences,
} from "../nd/types.js";
import type { SlashHandler } from "./types.js";

// `/nd` — view + configure the per-user neurodivergent support profile.
//   /nd                     list gates (● on / ○ off) + thresholds + preferences
//   /nd <gate> on|off       toggle an EF gate
//   /nd <gate> <number>     set a gate's threshold
//   /nd density <level>     output density: minimal | balanced | rich
//   /nd sensory <level>     sensory load:   low | medium | high
//   /nd time <style>        time support:   ranges | points | off
// Persists to ~/.vanta/nd-profile.json; VANTA_ND=off disables the gate engine.

// The preference keys settable from the command, each with its allowed values.
// `values` is the exact value tuple so the key/value pair stays correlated.
const PREF_KEYS = {
  density: { key: "outputDensity", values: OUTPUT_DENSITIES },
  sensory: { key: "sensoryLoad", values: SENSORY_LOADS },
  time: { key: "timeSupport", values: TIME_SUPPORT_STYLES },
} as const satisfies Record<string, { key: keyof NdPreferences; values: readonly NdPreferences[keyof NdPreferences][] }>;
type PrefWord = keyof typeof PREF_KEYS;

/** True if `value` is a valid value for the preference word (narrows the union). */
function isPrefValue(word: PrefWord, value: string): value is NdPreferences[(typeof PREF_KEYS)[PrefWord]["key"]] {
  return (PREF_KEYS[word].values as readonly string[]).includes(value);
}

function formatList(config: NdConfig, prefs: NdPreferences, env: NodeJS.ProcessEnv): string {
  const master = ndEngineEnabled(env) ? "" : "  (engine OFF — VANTA_ND=off)\n";
  const rows = GATES.map((g) => {
    const c = config[g.id];
    return `  ${c.enabled ? "●" : "○"} ${g.id.padEnd(16)} t=${c.threshold}  ${g.label.split("—")[1]?.trim() ?? ""}`;
  });
  const prefLines =
    `  preferences:\n` +
    `    density=${prefs.outputDensity}  sensory=${prefs.sensoryLoad}  time=${prefs.timeSupport}`;
  return (
    `  ND profile — executive-function gates:\n${master}${rows.join("\n")}\n${prefLines}\n` +
    `  gate: /nd <gate> on|off | <gate> <n> · pref: /nd density|sensory|time <value>`
  );
}

/** Set one preference; returns the confirmation/usage line. */
async function setPref(word: PrefWord, value: string | undefined, prefs: NdPreferences, env: NodeJS.ProcessEnv) {
  const spec = PREF_KEYS[word];
  if (value === undefined || !isPrefValue(word, value)) {
    return `  usage: /nd ${word} <${spec.values.join("|")}>`;
  }
  await saveNdPreferences(setNdPreference(prefs, spec.key, value), env);
  invalidateNdConfig();
  return `  ✓ ${word} = ${value}`;
}

export const nd: SlashHandler = async (arg, ctx) => {
  const env = ctx.env;
  const { gates, prefs } = await loadNdProfile(env);
  const [word, val] = arg.trim().split(/\s+/).filter(Boolean);
  if (!word) return { output: formatList(gates, prefs, env) };
  if (word in PREF_KEYS) return { output: await setPref(word as PrefWord, val, prefs, env) };
  if (!isGateId(word)) return { output: `  unknown gate "${word}".\n${formatList(gates, prefs, env)}` };
  if (val === "on" || val === "off") {
    await saveNdConfig(setGateEnabled(gates, word, val === "on"), env);
    invalidateNdConfig();
    return { output: `  ✓ ${word} ${val}` };
  }
  const n = Number(val);
  if (val !== undefined && Number.isFinite(n)) {
    await saveNdConfig(setGateThreshold(gates, word, n), env);
    invalidateNdConfig();
    return { output: `  ✓ ${word} threshold = ${n}` };
  }
  return { output: `  usage: /nd [<gate> on|off | <gate> <threshold> | density|sensory|time <value>]` };
};
