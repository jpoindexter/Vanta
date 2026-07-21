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
  ACTIVATION_STATES,
  CAPACITY_LEVELS,
  MEMORY_LOADS,
  MOTIVATION_STATES,
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
  capacity: { key: "capacity", values: CAPACITY_LEVELS },
  load: { key: "memoryLoad", values: MEMORY_LOADS },
  activation: { key: "activation", values: ACTIVATION_STATES },
  motivation: { key: "motivation", values: MOTIVATION_STATES },
} as const satisfies Record<string, { key: keyof NdPreferences; values: readonly NdPreferences[keyof NdPreferences][] }>;
type PrefWord = keyof typeof PREF_KEYS;

/** True if `value` is a valid value for the preference word (narrows the union). */
function isPrefValue(word: PrefWord, value: string): value is NdPreferences[(typeof PREF_KEYS)[PrefWord]["key"]] {
  return (PREF_KEYS[word].values as readonly string[]).includes(value);
}

function formatList(config: NdConfig, prefs: NdPreferences, env: NodeJS.ProcessEnv, command: string): string {
  const master = ndEngineEnabled(env) ? "" : "  (engine OFF — VANTA_ND=off)\n";
  const rows = GATES.map((g) => {
    const c = config[g.id];
    return `  ${c.enabled ? "●" : "○"} ${g.id.padEnd(16)} t=${c.threshold}  ${g.label.split("—")[1]?.trim() ?? ""}`;
  });
  const prefLines =
    `  communication preferences: density=${prefs.outputDensity}  sensory=${prefs.sensoryLoad}  time=${prefs.timeSupport}\n` +
    `  current state: capacity=${prefs.capacity}  load=${prefs.memoryLoad}  activation=${prefs.activation}  motivation=${prefs.motivation}`;
  return (
    `  Support profile — executive-function gates:\n${master}${rows.join("\n")}\n${prefLines}\n` +
    `  gate: /${command} <gate> on|off | <gate> <n>\n` +
    `  state: /${command} capacity|load|activation|motivation <value> · /${command} reset`
  );
}

/** Set one preference; returns the confirmation/usage line. */
async function setPref(
  opts: {
    word: PrefWord;
    value: string | undefined;
    prefs: NdPreferences;
    env: NodeJS.ProcessEnv;
    command: string;
  },
) {
  const spec = PREF_KEYS[opts.word];
  if (opts.value === undefined || !isPrefValue(opts.word, opts.value)) {
    return `  usage: /${opts.command} ${opts.word} <${spec.values.join("|")}>`;
  }
  await saveNdPreferences(setNdPreference(opts.prefs, spec.key, opts.value), opts.env);
  invalidateNdConfig();
  return `  ✓ ${opts.word} = ${opts.value}`;
}

async function handleSupport(arg: string, ctx: Parameters<SlashHandler>[1], command: string) {
  const env = ctx.env;
  const { gates, prefs } = await loadNdProfile(env);
  const [word, val] = arg.trim().split(/\s+/).filter(Boolean);
  if (!word) return { output: formatList(gates, prefs, env, command) };
  if (word === "reset") {
    const reset = {
      ...prefs,
      capacity: "auto" as const,
      memoryLoad: "auto" as const,
      activation: "auto" as const,
      motivation: "auto" as const,
    };
    await saveNdPreferences(reset, env);
    invalidateNdConfig();
    return { output: "  ✓ current support state reset to auto" };
  }
  if (word in PREF_KEYS) {
    return { output: await setPref({ word: word as PrefWord, value: val, prefs, env, command }) };
  }
  if (!isGateId(word)) return { output: `  unknown gate or support setting "${word}".\n${formatList(gates, prefs, env, command)}` };
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
  return { output: `  usage: /${command} [<gate> on|off | <gate> <threshold> | <setting> <value> | reset]` };
}

export const nd: SlashHandler = (arg, ctx) => handleSupport(arg, ctx, "nd");
export const support: SlashHandler = (arg, ctx) => handleSupport(arg, ctx, "support");
