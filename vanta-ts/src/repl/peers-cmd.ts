import { listPeers, formatPeers } from "../uds/peers.js";
import type { ReplCtx, SlashResult, SlashHandler } from "./types.js";

/**
 * /peers — list other live Vanta sessions discovered over Unix domain sockets
 * (id, title, pid). The agent can list_peers + peer_send to collaborate across
 * sessions; this is the human-facing view of the same registry.
 */
export const peers: SlashHandler = async (_arg, ctx: ReplCtx): Promise<SlashResult> => {
  const selfId = ctx.env.VANTA_PEER_ID?.trim() || undefined;
  try {
    const live = await listPeers(ctx.env, selfId);
    return { output: formatPeers(live, selfId) };
  } catch (err) {
    return { output: `  /peers failed: ${(err as Error).message}` };
  }
};
