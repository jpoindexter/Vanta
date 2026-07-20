import type { DesktopImageAttachment } from "./types.js";

export const MAX_CLIPBOARD_IMAGE_BYTES = 10 * 1024 * 1024;

const MIME_MAP: Record<string, DesktopImageAttachment["mime"]> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/tiff": "image/tiff",
};

export type ClipboardImageResult = {
  images: DesktopImageAttachment[];
  errors: string[];
};

export function clipboardImageFiles(data: DataTransfer): File[] {
  const fromItems = Array.from(data.items ?? [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
  const candidates = fromItems.length ? fromItems : Array.from(data.files ?? []).filter((file) => file.type.startsWith("image/"));
  const seen = new Set<string>();
  return candidates.filter((file) => {
    const key = [file.name, file.type, file.size, file.lastModified].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function insertClipboardText(value: string, text: string, start: number, end: number): { value: string; cursor: number } {
  const next = `${value.slice(0, start)}${text}${value.slice(end)}`;
  return { value: next, cursor: start + text.length };
}

export async function clipboardFilesToImages(files: File[], maximumBytes = MAX_CLIPBOARD_IMAGE_BYTES): Promise<ClipboardImageResult> {
  const images: DesktopImageAttachment[] = [];
  const errors: string[] = [];
  for (const file of files) {
    const mime = MIME_MAP[file.type.toLowerCase()];
    if (!mime) {
      errors.push(`${file.name || "Clipboard image"} is not PNG, JPEG, or TIFF.`);
      continue;
    }
    if (file.size > maximumBytes) {
      errors.push(`${file.name || "Clipboard image"} is larger than ${Math.round(maximumBytes / 1024 / 1024)} MB.`);
      continue;
    }
    const dataBase64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
    images.push({ id: attachmentId(), name: file.name || `clipboard.${extensionFor(mime)}`, mime, dataBase64, bytes: file.size });
  }
  return { images, errors };
}

export function imagePreviewUrl(image: DesktopImageAttachment): string {
  return `data:${image.mime};base64,${image.dataBase64}`;
}

export function mergeClipboardImages(current: DesktopImageAttachment[], incoming: DesktopImageAttachment[]): DesktopImageAttachment[] {
  const signatures = new Set(current.map(imageSignature));
  return [...current, ...incoming.filter((image) => {
    const signature = imageSignature(image);
    if (signatures.has(signature)) return false;
    signatures.add(signature);
    return true;
  })];
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

function attachmentId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `clipboard-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function extensionFor(mime: DesktopImageAttachment["mime"]): string {
  return mime === "image/jpeg" ? "jpg" : mime === "image/tiff" ? "tiff" : "png";
}

function imageSignature(image: DesktopImageAttachment): string {
  return `${image.mime}:${image.bytes}:${image.dataBase64.slice(0, 48)}`;
}
