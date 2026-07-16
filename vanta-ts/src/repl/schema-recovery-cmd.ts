import { formatCounterexampleForCli, readLatestCounterexampleEpisode } from "../schema/counterexample.js";
import type { SlashHandler } from "./types.js";

export const schemaRecovery: SlashHandler = async (_arg, ctx) => {
  const episode = await readLatestCounterexampleEpisode(ctx.dataDir);
  return { output: episode ? formatCounterexampleForCli(episode) : "No Schema counterexample recovery is open." };
};
