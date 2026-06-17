import { GATES } from "../nd/gates.js";
import { loadNdConfig, saveNdConfig, invalidateNdConfig, isGateId, ndEngineEnabled } from "../nd/profile.js";
import { setGateEnabled, setGateThreshold } from "../nd/engine.js";
import type { NdConfig } from "../nd/types.js";
import type { SlashHandler } from "./types.js";

// `/nd` — view + configure the executive-function support gates (per user).
//   /nd                     list gates (● on / ○ off) + thresholds
//   /nd <gate> on|off       toggle a gate
//   /nd <gate> <number>     set a gate's threshold
// Config persists to ~/.vanta/nd-profile.json; VANTA_ND=off disables all.

function formatList(config: NdConfig, env: NodeJS.ProcessEnv): string {
  const master = ndEngineEnabled(env) ? "" : "  (engine OFF — VANTA_ND=off)\n";
  const rows = GATES.map((g) => {
    const c = config[g.id];
    return `  ${c.enabled ? "●" : "○"} ${g.id.padEnd(16)} t=${c.threshold}  ${g.label.split("—")[1]?.trim() ?? ""}`;
  });
  return `  ND executive-function gates:\n${master}${rows.join("\n")}\n  toggle: /nd <gate> on|off · threshold: /nd <gate> <n>`;
}

export const nd: SlashHandler = async (arg, ctx) => {
  const env = ctx.env;
  const config = await loadNdConfig(env);
  const [id, val] = arg.trim().split(/\s+/).filter(Boolean);
  if (!id) return { output: formatList(config, env) };
  if (!isGateId(id)) return { output: `  unknown gate "${id}".\n${formatList(config, env)}` };
  if (val === "on" || val === "off") {
    await saveNdConfig(setGateEnabled(config, id, val === "on"), env);
    invalidateNdConfig();
    return { output: `  ✓ ${id} ${val}` };
  }
  const n = Number(val);
  if (val !== undefined && Number.isFinite(n)) {
    await saveNdConfig(setGateThreshold(config, id, n), env);
    invalidateNdConfig();
    return { output: `  ✓ ${id} threshold = ${n}` };
  }
  return { output: `  usage: /nd [<gate> on|off | <gate> <threshold>]` };
};
