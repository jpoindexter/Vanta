import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ImageAttachment, ImageCaptureReceipt } from "../types.js";
import { isBlankPng } from "./png-content.js";

export type LookCaptureMode = "screen" | "window" | "marquee";

export type LookCaptureReceipt = ImageCaptureReceipt;

export type LookCaptureImage = ImageAttachment & {
  name: string;
  capture: LookCaptureReceipt;
};

export type LookCaptureResult =
  | { status: "captured"; images: LookCaptureImage[] }
  | { status: "cancelled" }
  | { status: "denied"; recovery: string }
  | { status: "oversized"; recovery: string; bytes: number }
  | { status: "failed"; error: string };

export type LookCaptureOptions = {
  mode: LookCaptureMode;
  scope: string;
  maxBytes?: number;
  ttlMs?: number;
};

type LookCaptureDeps = {
  now?: () => Date;
  root?: string;
  run?: (args: string[]) => Promise<void>;
  openSettings?: () => Promise<void>;
};

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_TTL_MS = 5 * 60 * 1000;
export const SCREEN_RECORDING_SETTINGS = "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";

export async function captureLook(options: LookCaptureOptions, deps: LookCaptureDeps = {}): Promise<LookCaptureResult> {
  if (process.platform !== "darwin" && !deps.run) return { status: "failed", error: "Look capture is available on macOS." };
  const now = deps.now?.() ?? new Date();
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const scope = scopeId(options.scope);
  const scopeRoot = join(deps.root ?? join(tmpdir(), "vanta-look-captures"), scope);
  await mkdir(scopeRoot, { recursive: true });
  await cleanupExpired(scopeRoot, now.getTime());
  const captureDir = join(scopeRoot, `${now.getTime()}-${randomUUID()}`);
  const target = join(captureDir, "capture.png");
  await mkdir(captureDir, { recursive: true });
  try {
    try {
      await (deps.run ?? runScreencapture)(screencaptureArgs(options.mode, target));
    } catch (error) {
      return await captureFailure(error, options.mode, deps.openSettings);
    }
    const result = await collectCapture(captureDir, options, now, ttlMs);
    if (result.status === "denied") await (deps.openSettings ?? openScreenRecordingSettings)().catch(() => undefined);
    return result;
  } finally {
    await rm(captureDir, { recursive: true, force: true });
  }
}

export function screencaptureArgs(mode: LookCaptureMode, target: string): string[] {
  if (mode === "window") return ["-x", "-i", "-W", "-w", "-tpng", target];
  if (mode === "marquee") return ["-x", "-i", "-s", "-tpng", target];
  return ["-x", "-tpng", target];
}

async function collectCapture(dir: string, options: LookCaptureOptions, now: Date, ttlMs: number): Promise<LookCaptureResult> {
  const names = (await readdir(dir)).filter((name) => name.toLowerCase().endsWith(".png")).sort(captureFileOrder);
  if (!names.length) return options.mode === "screen"
    ? { status: "failed", error: "Screen capture produced no image." }
    : { status: "cancelled" };
  const buffers = await Promise.all(names.map((name) => readFile(join(dir, name))));
  const totalBytes = buffers.reduce((sum, buffer) => sum + buffer.length, 0);
  if (buffers.every(isBlankPng)) return { status: "denied", recovery: screenRecordingRecovery() };
  if (totalBytes > (options.maxBytes ?? DEFAULT_MAX_BYTES)) {
    return { status: "oversized", bytes: totalBytes, recovery: "Capture a smaller marquee, then retry." };
  }
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  return { status: "captured", images: buffers.map((buffer, index) => captureImage(buffer, options, now, expiresAt, index)) };
}

function captureFileOrder(left: string, right: string): number {
  if (left === "capture.png") return -1;
  if (right === "capture.png") return 1;
  return left.localeCompare(right, undefined, { numeric: true });
}

function captureImage(buffer: Buffer, options: LookCaptureOptions, now: Date, expiresAt: string, index: number): LookCaptureImage {
  const size = pngPixelSize(buffer);
  return {
    mime: "image/png",
    dataBase64: buffer.toString("base64"),
    name: `look-${options.mode}${index ? `-${index + 1}` : ""}.png`,
    capture: {
      source: "macos-screencapture",
      capturedAt: now.toISOString(),
      expiresAt,
      scope: scopeId(options.scope),
      mode: options.mode,
      display: index + 1,
      bytes: buffer.length,
      ...size,
    },
  };
}

async function captureFailure(error: unknown, mode: LookCaptureMode, openSettings?: () => Promise<void>): Promise<LookCaptureResult> {
  const message = error instanceof Error ? error.message : String(error);
  if (/cancel(?:led)?|escape/i.test(message) && mode !== "screen") return { status: "cancelled" };
  if (/not authorized|permission|screen recording|could not create image/i.test(message)) {
    await (openSettings ?? openScreenRecordingSettings)().catch(() => undefined);
    return { status: "denied", recovery: screenRecordingRecovery() };
  }
  return { status: "failed", error: message.split("\n")[0] ?? "Screen capture failed." };
}

function screenRecordingRecovery(): string {
  return "Allow Vanta in System Settings > Privacy & Security > Screen Recording, then retry /look.";
}

async function cleanupExpired(scopeRoot: string, nowMs: number): Promise<void> {
  const names = await readdir(scopeRoot).catch(() => []);
  await Promise.all(names.map(async (name) => {
    const path = join(scopeRoot, name);
    const info = await stat(path).catch(() => null);
    if (info && info.mtimeMs < nowMs - DEFAULT_TTL_MS) await rm(path, { recursive: true, force: true });
  }));
}

function pngPixelSize(buffer: Buffer): { pixelWidth?: number; pixelHeight?: number } {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return {};
  return { pixelWidth: buffer.readUInt32BE(16), pixelHeight: buffer.readUInt32BE(20) };
}

function scopeId(scope: string): string {
  return createHash("sha256").update(scope).digest("hex").slice(0, 12);
}

async function runScreencapture(args: string[]): Promise<void> {
  await promisify(execFile)("screencapture", args);
}

async function openScreenRecordingSettings(): Promise<void> {
  await promisify(execFile)("open", [SCREEN_RECORDING_SETTINGS]);
}
