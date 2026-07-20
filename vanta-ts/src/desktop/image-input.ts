import type { ImageAttachment } from "../types.js";

const SUPPORTED_MIME = new Set(["image/png", "image/jpeg", "image/tiff"]);
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
export const MAX_DESKTOP_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_DESKTOP_IMAGE_TOTAL_BYTES = 20 * 1024 * 1024;
export const MAX_DESKTOP_IMAGES = 4;

export type DesktopImageInputResult =
  | { ok: true; images: ImageAttachment[] }
  | { ok: false; error: string };

export function parseDesktopImageInput(value: unknown): DesktopImageInputResult {
  if (value === undefined) return { ok: true, images: [] };
  if (!Array.isArray(value)) return { ok: false, error: "images must be an array" };
  if (value.length > MAX_DESKTOP_IMAGES) return { ok: false, error: `at most ${MAX_DESKTOP_IMAGES} images can be attached` };
  const images: ImageAttachment[] = [];
  let totalBytes = 0;
  for (const entry of value) {
    const parsed = parseImage(entry);
    if (!parsed.ok) return parsed;
    totalBytes += Buffer.byteLength(parsed.image.dataBase64, "base64");
    if (totalBytes > MAX_DESKTOP_IMAGE_TOTAL_BYTES) return { ok: false, error: "attached images exceed the 20 MB total limit" };
    images.push(parsed.image);
  }
  return { ok: true, images };
}

function parseImage(value: unknown): { ok: true; image: ImageAttachment } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "each image must be an object" };
  const candidate = value as Record<string, unknown>;
  const mime = typeof candidate.mime === "string" ? candidate.mime.toLowerCase() : "";
  const dataBase64 = typeof candidate.dataBase64 === "string" ? candidate.dataBase64 : "";
  if (!SUPPORTED_MIME.has(mime)) return { ok: false, error: "images must be PNG, JPEG, or TIFF" };
  if (!dataBase64 || dataBase64.length % 4 !== 0 || !BASE64.test(dataBase64)) return { ok: false, error: "image data must be valid base64" };
  if (Buffer.byteLength(dataBase64, "base64") > MAX_DESKTOP_IMAGE_BYTES) return { ok: false, error: "an attached image exceeds the 10 MB limit" };
  return { ok: true, image: { mime, dataBase64 } };
}
