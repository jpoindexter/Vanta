import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import type { PlatformAdapter } from "../gateway/platforms/base.js";
import {
  createAdapter,
  implementedPlatformIds,
  type CreateAdapterError,
} from "../gateway/platforms/factory.js";

// `send_chat` — proactively message a configured chat platform WITHOUT the
// gateway process running. The gateway only replies in-band; this lets a
// cron/loop wake ("I finished X") reach a chat on its own. It resolves a
// concrete adapter through the messaging factory (NOT the gateway), connects,
// sends one message, and disconnects.
//
// Naming: deliberately `send_chat`, never `send_message` — the latter is the
// A2A agent-bus tool (`send-message.ts`). No collision.
//
// The adapter resolver is injectable via `ctx` so tests use a fake adapter and
// never touch the network. Production resolution goes through the real factory.

const Args = z.object({
  platform: z.string().min(1).describe("Configured platform id, e.g. telegram."),
  chatId: z.string().min(1).describe("Platform-specific conversation id to send to."),
  text: z.string().min(1).describe("The message text to send."),
});
type SendChatArgs = z.infer<typeof Args>;

/** Resolve a connectable adapter by platform id; errors-as-values on a miss. */
export type AdapterResolver = (
  platform: string,
  env: NodeJS.ProcessEnv,
) => PlatformAdapter | CreateAdapterError;

/** ctx may carry a fake resolver for tests; production falls back to the factory. */
type SendChatContext = ToolContext & { resolveAdapter?: AdapterResolver };

const defaultResolver: AdapterResolver = (platform, env) => createAdapter(platform, env);

function isResolveError(r: PlatformAdapter | CreateAdapterError): r is CreateAdapterError {
  return "ok" in r && r.ok === false;
}

/** Connect → send one message → disconnect, errors-as-values (never throws). */
async function sendVia(adapter: PlatformAdapter, args: SendChatArgs): Promise<ToolResult> {
  try {
    await adapter.connect();
  } catch (err) {
    return { ok: false, output: `connect failed for "${args.platform}": ${(err as Error).message}` };
  }
  try {
    await adapter.send({ chatId: args.chatId, text: args.text });
  } catch (err) {
    await adapter.disconnect().catch(() => {});
    return { ok: false, output: `send failed for "${args.platform}": ${(err as Error).message}` };
  }
  await adapter.disconnect().catch(() => {});
  return { ok: true, output: `sent to ${args.platform}:${args.chatId} (${args.text.length} chars)` };
}

async function run(args: SendChatArgs, ctx: SendChatContext): Promise<ToolResult> {
  const approved = await ctx.requestApproval(
    `send a chat to ${args.platform}:${args.chatId}`,
    "sends an outbound message to a chat platform — leaves the local machine",
    "send_chat",
  );
  if (!approved) return { ok: false, output: "denied by user" };

  const resolve = ctx.resolveAdapter ?? defaultResolver;
  const resolved = resolve(args.platform, process.env);
  if (isResolveError(resolved)) return { ok: false, output: resolved.error };
  return sendVia(resolved, args);
}

export const sendChatTool: Tool = {
  schema: {
    name: "send_chat",
    description:
      "Proactively send a message to a configured chat platform (e.g. telegram) — works WITHOUT the " +
      "gateway running. Resolves the platform's adapter, connects, sends one message, and disconnects. " +
      "Use to push an update to a chat from a cron/loop wake. Outbound — approval-gated. " +
      `Implemented platforms: ${implementedPlatformIds().join(", ")}.`,
    parameters: {
      type: "object",
      properties: {
        platform: { type: "string", description: "Configured platform id, e.g. telegram" },
        chatId: { type: "string", description: "Platform-specific conversation id to send to" },
        text: { type: "string", description: "The message text to send" },
      },
      required: ["platform", "chatId", "text"],
    },
  },
  // Surface the platform + chat (the outbound target) so the kernel gates the
  // send as an outbound comms action — never the message body.
  describeForSafety: (a) =>
    `send a chat to ${String(a.platform ?? "?")}:${String(a.chatId ?? "?")}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'send_chat needs "platform", "chatId", and "text" strings' };
    }
    return run(parsed.data, ctx as SendChatContext);
  },
};
