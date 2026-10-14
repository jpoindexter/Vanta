import type { ComposerAttachment } from '@/store/composer'

/** The limits the Vanta server enforces on `images[]` (vanta-ts/src/desktop/image-input.ts). */
export const MAX_IMAGES = 4
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024

const MIME_ALIASES: Record<string, string> = { 'image/jpg': 'image/jpeg', 'image/tif': 'image/tiff' }
const SUPPORTED_MIME = new Set(['image/jpeg', 'image/png', 'image/tiff'])

const EXTENSION_MIME: Record<string, string> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  tif: 'image/tiff',
  tiff: 'image/tiff'
}

export interface InlineImage {
  dataBase64: string
  mime: string
}

export type ImageReadResult = { image: InlineImage; ok: true } | { error: string; ok: false }

const megabytes = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MB`

/** The decoded size of a base64 payload. */
export const base64Bytes = (base64: string): number =>
  Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)

/** The server's MIME for a browser type or a file name; empty when it is neither. */
export function imageMime(type: string, name = ''): string {
  const declared = type.split(';')[0].trim().toLowerCase()
  const mime = MIME_ALIASES[declared] ?? declared

  if (mime) {
    return mime
  }

  return EXTENSION_MIME[name.split('.').pop()?.toLowerCase() ?? ''] ?? ''
}

/** Validate a decoded image against the server's type and size rules, with an error the user can act on. */
export function imageFromBase64(dataBase64: string, mimeType: string, label: string): ImageReadResult {
  const mime = imageMime(mimeType)

  if (!SUPPORTED_MIME.has(mime)) {
    return { error: `${label}: Vanta accepts PNG, JPEG or TIFF images${mime ? ` (this is ${mime})` : ''}.`, ok: false }
  }

  if (!dataBase64) {
    return { error: `${label}: the image is empty.`, ok: false }
  }

  const bytes = base64Bytes(dataBase64)

  if (bytes > MAX_IMAGE_BYTES) {
    return {
      error: `${label} is ${megabytes(bytes)}; the limit is ${megabytes(MAX_IMAGE_BYTES)} per image.`,
      ok: false
    }
  }

  return { image: { dataBase64, mime }, ok: true }
}

/** Split a `data:<mime>;base64,<data>` URL. */
export function imageFromDataUrl(dataUrl: string, label: string, fallbackMime = ''): ImageReadResult {
  const match = /^data:([^;,]*)(?:;[^,]*)?;base64,(.*)$/s.exec(dataUrl)

  if (!match) {
    return { error: `${label}: could not read the image.`, ok: false }
  }

  return imageFromBase64(match[2], match[1] || fallbackMime, label)
}

const CHUNK = 0x8000

function base64Of(bytes: Uint8Array): string {
  let binary = ''

  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK))
  }

  return btoa(binary)
}

/** Read a pasted, dropped or picked blob into memory, refusing oversize or unsupported images before reading. */
export async function imageFromBlob(blob: Blob, label: string): Promise<ImageReadResult> {
  const mime = imageMime(blob.type, label)

  if (blob.size > MAX_IMAGE_BYTES) {
    return {
      error: `${label} is ${megabytes(blob.size)}; the limit is ${megabytes(MAX_IMAGE_BYTES)} per image.`,
      ok: false
    }
  }

  return imageFromBase64(base64Of(new Uint8Array(await blob.arrayBuffer())), mime, label)
}

export const inlineImagesOf = (attachments: readonly ComposerAttachment[]): InlineImage[] =>
  attachments.flatMap(attachment => (attachment.imageData ? [attachment.imageData] : []))

/** An error message when `next` would push the composer past the count or total-size limit; null when it fits. */
export function imageBudgetError(existing: readonly ComposerAttachment[], next: InlineImage): null | string {
  const images = inlineImagesOf(existing)

  if (images.length >= MAX_IMAGES) {
    return `You can attach up to ${MAX_IMAGES} images to one message. Remove one first.`
  }

  const total = images.reduce((sum, image) => sum + base64Bytes(image.dataBase64), 0) + base64Bytes(next.dataBase64)

  return total > MAX_TOTAL_IMAGE_BYTES
    ? `Attached images would be ${megabytes(total)}; the limit is ${megabytes(MAX_TOTAL_IMAGE_BYTES)} per message.`
    : null
}

/** The `images` field for prompt.submit; undefined when nothing is attached inline. */
export function promptImages(attachments: readonly ComposerAttachment[]): InlineImage[] | undefined {
  const images = inlineImagesOf(attachments)

  return images.length ? images : undefined
}

/** `{ images }` for the prompt.submit params, or nothing when no image is attached inline. */
export const promptImageParams = (attachments: readonly ComposerAttachment[]): { images?: InlineImage[] } => {
  const images = promptImages(attachments)

  return images ? { images } : {}
}
