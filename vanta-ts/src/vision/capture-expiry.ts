import type { ImageAttachment, ImageCaptureReceipt } from "../types.js";

export function isActiveCapture(capture: ImageCaptureReceipt, nowMs = Date.now()): boolean {
  const capturedMs = Date.parse(capture.capturedAt);
  const expiresMs = Date.parse(capture.expiresAt);
  return Number.isFinite(capturedMs) && Number.isFinite(expiresMs) && expiresMs > capturedMs && expiresMs > nowMs;
}

export function activeImageAttachments(images: ImageAttachment[] | undefined, nowMs = Date.now()): ImageAttachment[] | undefined {
  const active = images?.filter((image) => !image.capture || isActiveCapture(image.capture, nowMs));
  return active?.length ? active : undefined;
}
