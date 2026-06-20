import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { runVisionWatchStep, type VisionWatchStep, type VisionWatchDeps } from "../vision/watch.js";
import { resolveVisionProvider } from "../routing/vision.js";
import {
  buildLiveWatchDeps,
  loadWatchState,
  saveWatchState,
  type WatchSource,
} from "./vision-watch-run.js";

// VISION-WATCH-ALERT — the "watch what's next" sense. One call captures a frame,
// detects a meaningful change versus the prior frame (persisted under .vanta/),
// and on a change describes it with a vision model and alerts the operator via
// the gateway. The detection + orchestration are pure (`vision/watch.ts`); this
// tool wires the live substrate. Run it periodically via `vanta cron` for a
// standing watch. Live boundary: macOS + Screen Recording + a vision model + a
// configured gateway platform.

const Args = z.object({
  platform: z.string().min(1),
  chatId: z.string().min(1),
  source: z.enum(["screen", "camera"]).optional(),
  threshold: z.number().min(0).max(1).optional(),
});

/** One-line summary of a watch step. Pure. */
export function formatWatchStep(step: VisionWatchStep): string {
  if (step.changed && step.alerted) return `✓ ${step.note}\n  ${step.description ?? ""}`.trimEnd();
  if (step.changed) return `⚠ ${step.note}${step.description ? `\n  ${step.description}` : ""}`;
  return `· ${step.note}`;
}

/** Tool core with the substrate injectable for tests (no real capture/vision/network). */
export async function runVisionWatchTool(
  raw: unknown,
  ctx: ToolContext,
  deps?: VisionWatchDeps,
): Promise<ToolResult> {
  const parsed = Args.safeParse(raw);
  if (!parsed.success) return { ok: false, output: 'vision_watch needs "platform" and "chatId" strings' };
  const { platform, chatId, threshold } = parsed.data;
  const source: WatchSource = parsed.data.source ?? "screen";

  let live = deps;
  if (!live) {
    let provider;
    try {
      provider = resolveVisionProvider(process.env);
    } catch (err) {
      return { ok: false, output: `vision_watch needs a vision model: ${(err as Error).message}` };
    }
    live = buildLiveWatchDeps(provider, ctx, { platform, chatId }, threshold ?? 0);
  }

  const state = await loadWatchState(ctx.root, source);
  const step = await runVisionWatchStep(live, state);
  await saveWatchState(ctx.root, source, state);
  return { ok: true, output: formatWatchStep(step) };
}

export const visionWatchTool: Tool = {
  schema: {
    name: "vision_watch",
    description:
      "Capture one frame of the screen (or camera), detect a meaningful change versus the prior frame, and " +
      "on a change describe it with a vision model and alert the operator over the gateway (send_chat). " +
      "Vanta's 'watch what's next' sense — run it periodically via `vanta cron` for a standing watch. " +
      "macOS: needs a vision model + Screen Recording permission + a configured gateway platform.",
    parameters: {
      type: "object",
      properties: {
        platform: { type: "string", description: "Configured gateway platform id to alert on, e.g. telegram" },
        chatId: { type: "string", description: "Platform-specific conversation id to alert" },
        source: { type: "string", enum: ["screen", "camera"], description: "What to watch (default screen)" },
        threshold: { type: "number", description: "0..1 change sensitivity; 0 = any change alerts (default 0)" },
      },
      required: ["platform", "chatId"],
    },
  },
  describeForSafety: (a) => `watch ${String(a.source ?? "screen")} and alert ${String(a.platform ?? "?")}:${String(a.chatId ?? "?")} on change`,
  execute: (raw, ctx) => runVisionWatchTool(raw, ctx),
};
