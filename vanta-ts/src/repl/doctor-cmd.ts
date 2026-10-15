import { dirname } from "node:path";
import { contextDoctorReport } from "../cli/harness-thickness-cmd.js";
import { formatStatus, gatherStatus, resolveStatusCondensed } from "../status.js";
import type { SlashHandler } from "./types.js";

function resultLimit(arg: string): number {
  const match = arg.match(/(?:^|\s)--limit\s+(\d+)(?:\s|$)/);
  return match ? Number(match[1]) : 5;
}

/** `/doctor` combines ordinary health with read-only context engineering. */
export const doctor: SlashHandler = async (arg, ctx) => {
  const verbose = /(?:^|\s)(?:--verbose|-v)(?:\s|$)/.test(arg);
  const condensed = resolveStatusCondensed(ctx.env, { verbose, isTTY: true });
  const health = formatStatus(await gatherStatus(ctx.env), { condensed });
  const context = await contextDoctorReport(dirname(ctx.dataDir), resultLimit(arg));
  return {
    output: [
      health,
      context,
      "",
      "Next: `/skill context-doctor` for semantic conflicts and a reviewed cleanup diff.",
    ].join("\n"),
  };
};
