import type http from "node:http";
import { captureLook, type LookCaptureMode, type LookCaptureResult } from "../vision/look-capture.js";
import type { DesktopState } from "./handlers.js";
import { readJson, sendJson } from "./handlers.js";

type Capture = typeof captureLook;
type LookApiResult = { status: number; body: LookCaptureResult & { error?: string } };

export async function handleDesktopLookCapture(
  state: DesktopState,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  capture: Capture = captureLook,
): Promise<void> {
  const body = await readJson(req) as { mode?: unknown };
  const result = await desktopLookCapture(state.root, body.mode, capture);
  sendJson(res, result.status, result.body);
}

export async function desktopLookCapture(root: string, value: unknown, capture: Capture = captureLook): Promise<LookApiResult> {
  const mode = lookMode(value);
  if (!mode) return { status: 400, body: { status: "failed", error: "mode must be marquee, window, or screen" } };
  const body = await capture({ mode, scope: root });
  if (body.status === "denied") return { status: 403, body: { ...body, error: body.recovery } };
  if (body.status === "oversized") return { status: 413, body: { ...body, error: body.recovery } };
  if (body.status === "failed") return { status: 500, body };
  return { status: 200, body };
}

function lookMode(value: unknown): LookCaptureMode | null {
  return value === "marquee" || value === "window" || value === "screen" ? value : null;
}
