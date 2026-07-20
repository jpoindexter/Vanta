import type { ImageAttachment, ImageCaptureReceipt } from "../types.js";
import { isActiveCapture } from "../vision/capture-expiry.js";

const SUPPORTED_MIME = new Set(["image/png", "image/jpeg", "image/tiff"]);
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
export const MAX_DESKTOP_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_DESKTOP_IMAGE_TOTAL_BYTES = 20 * 1024 * 1024;
export const MAX_DESKTOP_IMAGES = 4;

export type DesktopImageInputResult =
  | { ok: true; images: ImageAttachment[] }
  | { ok: false; error: string };

export function parseDesktopImageInput(value: unknown, nowMs = Date.now()): DesktopImageInputResult {
  if (value === undefined) return { ok: true, images: [] };
  if (!Array.isArray(value)) return { ok: false, error: "images must be an array" };
  if (value.length > MAX_DESKTOP_IMAGES) return { ok: false, error: `at most ${MAX_DESKTOP_IMAGES} images can be attached` };
  const images: ImageAttachment[] = [];
  let totalBytes = 0;
  for (const entry of value) {
    const parsed = parseImage(entry, nowMs);
    if (!parsed.ok) return parsed;
    totalBytes += Buffer.byteLength(parsed.image.dataBase64, "base64");
    if (totalBytes > MAX_DESKTOP_IMAGE_TOTAL_BYTES) return { ok: false, error: "attached images exceed the 20 MB total limit" };
    images.push(parsed.image);
  }
  return { ok: true, images };
}

function parseImage(value: unknown, nowMs: number): { ok: true; image: ImageAttachment } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "each image must be an object" };
  const candidate = value as Record<string, unknown>;
  const mime = stringValue(candidate.mime).toLowerCase();
  const dataBase64 = stringValue(candidate.dataBase64);
  if (!SUPPORTED_MIME.has(mime)) return { ok: false, error: "images must be PNG, JPEG, or TIFF" };
  if (!validBase64(dataBase64)) return { ok: false, error: "image data must be valid base64" };
  if (Buffer.byteLength(dataBase64, "base64") > MAX_DESKTOP_IMAGE_BYTES) return { ok: false, error: "an attached image exceeds the 10 MB limit" };
  const capture = parseCapture(candidate.capture, nowMs);
  if (capture === false) return { ok: false, error: "image capture receipt is invalid" };
  return { ok: true, image: { mime, dataBase64, ...(capture ? { capture } : {}) } };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function validBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && BASE64.test(value);
}

function parseCapture(value: unknown, nowMs: number): ImageCaptureReceipt | undefined | false {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  if (!validCaptureShape(item)) return false;
  const capture = item as ImageCaptureReceipt;
  return isActiveCapture(capture, nowMs) ? capture : false;
}

function validCaptureShape(item: Record<string, unknown>): boolean {
  if (item.source !== "macos-screencapture") return false;
  if (!isCaptureMode(item.mode)) return false;
  if (![item.capturedAt, item.expiresAt, item.scope].every(nonEmptyString)) return false;
  return [item.display, item.bytes].every(nonNegativeNumber);
}

function isCaptureMode(value: unknown): boolean {
  return value === "screen" || value === "window" || value === "marquee";
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.length > 0;
}

function nonNegativeNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
