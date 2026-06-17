import { latestLocks } from "../verify/store.js";
import { formatLock } from "../verify/check.js";
import type { SlashHandler } from "./types.js";

// `/locks` — view the verification organ's regression locks: each verified
// claim, the command that proves it, and its current passing/regressed status.
// A window onto the `regression_lock` tool's store.

export const locks: SlashHandler = async (_arg, ctx) => {
  const all = await latestLocks(ctx.env);
  if (all.length === 0) {
    return {
      output:
        "No regression locks yet.\n  Lock a verified behavior with the regression_lock tool so a later change can't silently break it.",
    };
  }
  const regressed = all.filter((l) => l.status === "regressed").length;
  const head =
    regressed > 0
      ? `⚠ ${regressed}/${all.length} regression lock(s) REGRESSED`
      : `${all.length} regression lock(s)`;
  return { output: [head, ...all.map(formatLock)].join("\n") };
};
