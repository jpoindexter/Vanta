import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { REACH_CHANNELS, checkAll } from "../reach/registry.js";
import { formatDoctor } from "../reach/doctor.js";

const Args = z.object({
  action: z.enum(["doctor", "heal"]),
  channel: z.string().optional(),
});

async function doDoctor(): Promise<ToolResult> {
  return { ok: true, output: formatDoctor(await checkAll(process.env)) };
}

async function doHeal(channelName: string | undefined): Promise<ToolResult> {
  if (!channelName) return { ok: false, output: "heal needs a channel (e.g. twitter)" };
  const channel = REACH_CHANNELS.find((c) => c.name === channelName);
  if (!channel) return { ok: false, output: `unknown reach channel "${channelName}"` };
  if (!channel.heal) {
    return { ok: false, output: `channel "${channelName}" has no heal — it's built-in (web/search/rss) and can't break this way` };
  }
  const before = await channel.check(process.env);
  const healed = await channel.heal(process.env);
  if (!healed.ok) return { ok: false, output: `heal ${channelName} failed: ${healed.output}` };
  const after = await channel.check(process.env);
  return {
    ok: true,
    output: `Healed "${channelName}" — ran: ${healed.ran}\n  before: ${before.status} (${before.activeBackend ?? "—"})\n  after:  ${after.status} (${after.activeBackend ?? "—"})\n  ${healed.output}`,
  };
}

export const reachTool: Tool = {
  schema: {
    name: "reach",
    description:
      "Inspect + self-heal Vanta's internet-reach channels. action:doctor reports each channel's active backend + status + the exact fix on a gap. " +
      "action:heal {channel} rebuilds a broken CLI-backed channel (e.g. re-pulls twitter-cli when X changes its API), then re-checks. " +
      "Use heal when a reach channel (twitter, …) starts failing — the backend's maintainer tracks the platform's churn.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["doctor", "heal"] },
        channel: { type: "string", description: "channel to heal (e.g. twitter)" },
      },
      required: ["action"],
    },
  },
  // heal runs an install/upgrade → surface that so the kernel gates it.
  describeForSafety: (a) =>
    a.action === "heal" ? `upgrade reach backend (install): ${String(a.channel ?? "")}` : "reach doctor",
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'reach needs an "action" (doctor|heal)' };
    return parsed.data.action === "heal" ? doHeal(parsed.data.channel) : doDoctor();
  },
};
