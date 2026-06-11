import { z } from "zod";
import type { Tool } from "./types.js";
import type { A2APart } from "../a2a/types.js";
import { globalBus } from "../a2a/bus.js";
import { makeMessage } from "../a2a/local.js";

const Args = z.object({
  to: z.string().min(1).describe("The agent id to send to."),
  text: z.string().min(1).describe("The message text."),
  from: z.string().optional().describe("Optional sender id. Defaults to 'orchestrator'."),
});

export const sendMessageTool: Tool = {
  schema: {
    name: "send_message",
    description:
      "Send a message to a named agent registered on the A2A bus. " +
      "Returns the agent's reply, or a delivery note when the agent returns no reply.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "The agent id to send to." },
        text: { type: "string", description: "The message text." },
        from: { type: "string", description: "Optional sender id. Defaults to 'orchestrator'." },
      },
      required: ["to", "text"],
    },
  },
  describeForSafety: (args) =>
    `send_message to agent "${(args as { to?: string }).to ?? "?"}"`,
  execute: async (rawArgs) => {
    const parsed = Args.safeParse(rawArgs);
    if (!parsed.success) return { ok: false, output: `invalid args: ${parsed.error.message}` };
    const { to, text, from = "orchestrator" } = parsed.data;
    const agents = globalBus.list();
    if (!agents.includes(to)) {
      const avail = agents.length ? agents.join(", ") : "(none)";
      return { ok: false, output: `no agent "${to}" registered on the A2A bus. Available: ${avail}` };
    }
    try {
      const msg = makeMessage({ from, to, text });
      const reply = await globalBus.send(msg);
      if (!reply) return { ok: true, output: `message delivered to "${to}" (no reply)` };
      const replyText = reply.parts
        .filter((p): p is A2APart & { kind: "text" } => p.kind === "text")
        .map((p) => p.text)
        .join("\n");
      return { ok: true, output: replyText || `"${to}" replied (empty text)` };
    } catch (err) {
      return { ok: false, output: `send_message failed: ${(err as Error).message}` };
    }
  },
};
