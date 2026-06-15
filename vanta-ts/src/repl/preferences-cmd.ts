import { exportPreferenceSignalsJsonl } from "../preferences/signals.js";
import type { SlashHandler } from "./types.js";

export const preferences: SlashHandler = async (arg, ctx) => {
  if (arg.trim() !== "export") return { output: "  usage: /preferences export" };
  const exported = await exportPreferenceSignalsJsonl(ctx.env);
  const body = exported.content.trim();
  return { output: `  ⤓ ${exported.path}\n${body ? `${body}\n` : "  (no preference signals yet)"}` };
};
