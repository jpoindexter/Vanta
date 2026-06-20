import { createHash } from "node:crypto";
import { z } from "zod";
import type { LLMProvider } from "../providers/interface.js";
import type { ToolContext } from "./types.js";
import type { Frame, VisionWatchDeps, WatchState } from "../vision/watch.js";
import { sendChatTool } from "./send-chat.js";

// Live substrate for the vision watch. The PURE detection + orchestration live in
// `vision/watch.ts`; this wires the real effects — a macOS screencapture frame, a
// vision-model description, and a gateway alert via `send_chat`. The prior-hash
// state is persisted between (cron-invoked) calls under `.vanta/` so successive
// runs compare against the last frame. Live needs (documented boundary): macOS +
// Screen Recording permission (screencapture), a vision model (describe), and a
// configured gateway platform (the alert) — `npx playwright` is NOT involved.

const SOURCE = { screen: "screen", camera: "camera" } as const;
export type WatchSource = (typeof SOURCE)[keyof typeof SOURCE];

const STATE_DIR = ".vanta/vision-watch";
const WATCH_PROMPT =
  "Describe what is currently visible, focusing on what is new or noteworthy compared to a quiet scene. " +
  "Be concise — one or two sentences an operator can act on.";

const StateSchema = z.object({ prevHash: z.string().nullable() });

/** sha256 of the frame bytes — identical frames hash identically, so a no-change
 *  step is detected exactly. Pure. */
export function hashFrame(frame: Frame): string {
  return createHash("sha256").update(frame.bytes).digest("hex");
}

/** Per-watch state file path, keyed by source so screen and camera don't collide. */
export function stateFile(root: string, source: WatchSource): string {
  return `${root}/${STATE_DIR}/${source}.json`;
}

/** Load the persisted prior hash (null on first run / unreadable / corrupt). */
export async function loadWatchState(root: string, source: WatchSource): Promise<WatchState> {
  try {
    const { readFile } = await import("node:fs/promises");
    const parsed = StateSchema.safeParse(JSON.parse(await readFile(stateFile(root, source), "utf8")));
    return parsed.success ? parsed.data : { prevHash: null };
  } catch {
    return { prevHash: null };
  }
}

/** Persist the prior hash for the next (cron-invoked) step; best-effort. */
export async function saveWatchState(root: string, source: WatchSource, state: WatchState): Promise<void> {
  try {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    const file = stateFile(root, source);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ prevHash: state.prevHash }), "utf8");
  } catch {
    // a failed persist degrades to re-baselining next run, never throws
  }
}

/** Capture a frame from the screen (macOS screencapture, silent). Camera capture
 *  uses the same screencapture path today; a dedicated camera grab is the boundary. */
async function captureFrame(): Promise<Frame> {
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { readFile, rm } = await import("node:fs/promises");
  const tmp = join(tmpdir(), `vanta-watch-${process.pid}-${Date.now()}.png`);
  await promisify(execFile)("screencapture", ["-x", tmp]);
  const buf = await readFile(tmp).catch(() => Buffer.alloc(0));
  await rm(tmp, { force: true }).catch(() => {});
  if (!buf.length) throw new Error("screen capture failed (macOS only; grant Screen Recording permission)");
  return { bytes: new Uint8Array(buf) };
}

/** Describe a frame with the (auxiliary) vision provider. */
async function describeFrame(provider: LLMProvider, frame: Frame): Promise<string> {
  const result = await provider.complete(
    [{ role: "user", content: WATCH_PROMPT, images: [{ mime: "image/png", dataBase64: Buffer.from(frame.bytes).toString("base64") }] }],
    [],
  );
  const text = result.text?.trim();
  if (!text) throw new Error("vision model returned no description — set VANTA_VISION_MODEL to a vision-capable model");
  return text;
}

/** Alert the operator through the gateway by driving the `send_chat` tool — it
 *  resolves the platform adapter, connects, sends, and disconnects (approval-gated). */
async function alertViaGateway(
  ctx: ToolContext,
  target: { platform: string; chatId: string },
  description: string,
): Promise<boolean> {
  const res = await sendChatTool.execute(
    { platform: target.platform, chatId: target.chatId, text: `👁 Vision watch: ${description}` },
    ctx,
  );
  return res.ok;
}

/** Wire the watch loop to the real substrate. `threshold` 0 means any byte change
 *  counts; a perceptual hash would let a non-zero threshold ignore noise. */
export function buildLiveWatchDeps(
  provider: LLMProvider,
  ctx: ToolContext,
  target: { platform: string; chatId: string },
  threshold: number,
): VisionWatchDeps {
  return {
    capture: captureFrame,
    hash: hashFrame,
    describe: (frame) => describeFrame(provider, frame),
    alert: (description) => alertViaGateway(ctx, target, description),
    threshold,
  };
}
