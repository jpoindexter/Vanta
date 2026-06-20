import { z } from "zod";
import type { Tool } from "./types.js";
import { listPeers, sendToPeer, formatPeers } from "../uds/peers.js";

// list_peers + peer_send — agent-facing discovery and messaging across Vanta
// sessions over Unix domain sockets (lower-latency local IPC; distinct from the
// file-based swarm/A2A bus). list_peers enumerates other live sessions;
// peer_send delivers a message into one peer's inbox by agent id.

/** This session's peer id (set when the session advertises itself), if any. */
function selfId(env: NodeJS.ProcessEnv): string | undefined {
  const id = env.VANTA_PEER_ID?.trim();
  return id ? id : undefined;
}

export const listPeersTool: Tool = {
  schema: {
    name: "list_peers",
    description:
      "List other Vanta sessions running on this machine (peer agents discovered over Unix " +
      "domain sockets). Returns each live peer's id, title, and pid. Use peer_send with a " +
      "peer's id to collaborate across sessions.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  // Constant internal op — pure local discovery, no path/command → kernel Allow.
  describeForSafety: () => "list local vanta peer sessions",
  async execute(_raw, ctx) {
    try {
      const peers = await listPeers(process.env, selfId(process.env));
      if (peers.length === 0) {
        return { ok: true, output: "(no other live Vanta peers)" };
      }
      void ctx;
      return { ok: true, output: formatPeers(peers, selfId(process.env)) };
    } catch (err) {
      return { ok: false, output: `list_peers failed: ${(err as Error).message}` };
    }
  },
};

const SendArgs = z.object({
  to: z.string().min(1).describe("The peer agent id to send to (from list_peers)."),
  text: z.string().min(1).describe("The message text."),
});

export const peerSendTool: Tool = {
  schema: {
    name: "peer_send",
    description:
      "Send a message to another Vanta session over a Unix domain socket. Pass the target " +
      "peer's id (from list_peers) and the text; it is appended to that peer's inbox. Returns " +
      "delivered or failed.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "The peer agent id to send to (from list_peers)." },
        text: { type: "string", description: "The message text." },
      },
      required: ["to", "text"],
    },
  },
  // Surface the target id (the safety-relevant part) — not the message text.
  describeForSafety: (args) => `peer_send to peer "${(args as { to?: string }).to ?? "?"}"`,
  async execute(raw) {
    const parsed = SendArgs.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: `invalid args: ${parsed.error.message}` };
    }
    const { to, text } = parsed.data;
    const from = selfId(process.env) ?? "vanta";
    const res = await sendToPeer(to, { from, text }, process.env);
    return res.ok
      ? { ok: true, output: `message delivered to peer "${to}"` }
      : { ok: false, output: `peer_send failed: ${res.error ?? "unknown error"}` };
  },
};
