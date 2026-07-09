import { diagnoseCrashLog, formatCrashDiagnosis, GREG_UITESTS_CRASH_FIXTURE } from "../diagnose/crash.js";
import type { SlashHandler } from "./types.js";

export const diagnoseCrash: SlashHandler = (arg) => {
  const input = arg.trim() === "--demo greg-uitests" || arg.trim() === "--demo" ? GREG_UITESTS_CRASH_FIXTURE : arg;
  if (!input.trim()) return { output: "  usage: /diagnose-crash <pasted crash report> or /diagnose-crash --demo greg-uitests" };
  return { output: formatCrashDiagnosis(diagnoseCrashLog(input)) };
};
