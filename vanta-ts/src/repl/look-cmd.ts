import { dirname } from "node:path";
import { captureLook, type LookCaptureMode, type LookCaptureResult } from "../vision/look-capture.js";
import type { SlashHandler } from "./types.js";

type CaptureLook = typeof captureLook;

export function createLookHandler(capture: CaptureLook = captureLook): SlashHandler {
  return async (arg, ctx) => {
    const mode = parseLookMode(arg);
    if (!mode) return { output: "  usage: /look [marquee|window|screen]" };
    const result = await capture({ mode, scope: dirname(ctx.dataDir) });
    if (result.status !== "captured") return { output: formatLookFailure(result) };
    const first = result.images[0]?.capture;
    if (!first) return { output: "  look failed: capture produced no image" };
    (ctx.state.pendingImages ??= []).push(...result.images);
    const dimensions = first.pixelWidth && first.pixelHeight ? ` · ${first.pixelWidth}×${first.pixelHeight}px` : "";
    return {
      output: `  ◫ attached ${result.images.length} ${mode} capture(s)${dimensions}\n` +
        `  receipt: ${first.source} · ${first.capturedAt} · scope ${first.scope} · expires ${first.expiresAt}\n` +
        "  send a message to ask about it · /attachments clear to remove",
    };
  };
}

export const look = createLookHandler();

export function parseLookMode(arg: string): LookCaptureMode | null {
  const value = arg.trim().toLowerCase();
  if (!value || value === "marquee" || value === "selection") return "marquee";
  if (value === "screen" || value === "full") return "screen";
  if (value === "window") return "window";
  return null;
}

function formatLookFailure(result: Exclude<LookCaptureResult, { status: "captured" }>): string {
  if (result.status === "cancelled") return "  · look cancelled — nothing attached or sent";
  if (result.status === "denied" || result.status === "oversized") return `  look unavailable: ${result.recovery}`;
  return `  look failed: ${result.error}`;
}
