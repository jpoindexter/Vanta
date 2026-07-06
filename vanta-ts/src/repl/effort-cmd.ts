import { EFFORT_LEVELS, type EffortLevel } from "../types.js";
import { isEffortLevel } from "../effort.js";
import { rememberEffort } from "../models/presets.js";
import type { SlashHandler } from "./types.js";

function usage(current: EffortLevel): string {
  return `  effort ${current}\n  usage: /effort <${EFFORT_LEVELS.join("|")}>`;
}

export const effort: SlashHandler = (arg, ctx) => {
  const raw = arg.trim().toLowerCase();
  const current = ctx.state.effortLevel ?? ctx.setup.effortLevel;
  if (!raw) return { output: usage(current) };
  if (!isEffortLevel(raw)) return { output: `  invalid effort "${raw}"\n${usage(current)}` };
  ctx.state.effortLevel = raw;
  ctx.setup.effortLevel = raw;
  ctx.env.VANTA_EFFORT_LEVEL = raw;
  // OP-MODEL-PRESETS: the choice sticks to THIS model and re-applies on reselect.
  const modelId = ctx.setup.provider?.modelId?.();
  if (modelId) void rememberEffort(modelId, raw, ctx.env);
  return { output: `  effort ${raw}` };
};
