/** Local unsent attachments, never credentials, upload leases or action authority. */
export interface DraftOwner { connectionId: string; profile: string }
export interface DraftAttachment {
  id: string
  occurrenceId?: string
  kind: 'file' | 'folder' | 'image' | 'terminal' | 'url'
  label: string
  detail?: string
  path?: string
  refText?: string
  titlePreview?: string
  imageData?: { dataBase64: string; mime: string }
}
export interface DraftAddress { owner: DraftOwner; session: string }
export interface DraftCustodyRecord extends DraftAddress { version: 1; attachments: DraftAttachment[] }
export const MAX_DRAFT_RECORD_BYTES = 30 * 1024 * 1024
export const MAX_DRAFT_CUSTODY_BYTES = 100 * 1024 * 1024
export const MAX_DRAFT_CUSTODY_RECORDS = 50
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_IMAGES_BYTES = 20 * 1024 * 1024
const fail = (): never => { throw new Error('Unsent attachment data is invalid; the saved draft was not changed.') }
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail()
const string = (value: unknown, max: number): string =>
  typeof value === 'string' && value.length > 0 && value.length <= max && !value.includes('\0') ? value : fail()

export function draftAddress(raw: unknown): DraftAddress {
  const value = object(raw), owner = object(value.owner)
  return { owner: { connectionId: string(owner.connectionId, 2048), profile: string(owner.profile, 512) }, session: string(value.session, 2048) }
}

function requireCanonicalBase64(base64: string): void {
  if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) fail()
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  if (base64.endsWith('==') && alphabet.indexOf(base64.at(-3)!) % 16 !== 0) fail()
  if (!base64.endsWith('==') && base64.endsWith('=') && alphabet.indexOf(base64.at(-2)!) % 4 !== 0) fail()
}
const decodedImageSize = (base64: string) => base64.length / 4 * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)

function image(raw: unknown): DraftAttachment['imageData'] {
  if (raw === undefined) return undefined
  const value = object(raw), mime = string(value.mime, 64), base64 = string(value.dataBase64, 14 * 1024 * 1024)
  if (!['image/png', 'image/jpeg', 'image/tiff'].includes(mime)) fail()
  requireCanonicalBase64(base64)
  const size = decodedImageSize(base64)
  if (size === 0 || size > MAX_IMAGE_BYTES) fail()
  return { dataBase64: base64, mime }
}

function discardUploadLease(value: Record<string, unknown>, result: DraftAttachment): void {
  // Staged refs belong to a live session; only an original host image path survives.
  if (!value.attachedSessionId && !value.uploadState) return
  if (result.kind === 'image') {
    if (result.detail && /^(\/|[A-Za-z]:[\\/])/.test(result.detail)) result.path = result.detail
    else delete result.path
  }
  delete result.refText
}

export function draftAttachment(raw: unknown): DraftAttachment {
  const value = object(raw), kind = string(value.kind, 16) as DraftAttachment['kind']
  if (!['file', 'folder', 'image', 'terminal', 'url'].includes(kind)) fail()
  const result: DraftAttachment = { id: string(value.id, 8192), kind, label: string(value.label, 1024) }
  const limits = { occurrenceId: 256, detail: 8192, path: 8192, refText: 65536, titlePreview: 65536 } as const
  for (const key of Object.keys(limits) as Array<keyof typeof limits>) {
    if (value[key] !== undefined) result[key] = string(value[key], limits[key])
  }
  const data = image(value.imageData)
  if (kind === 'image' && !data) throw new Error('custody_image_loading: Image bytes are still loading; the saved draft was not changed.')
  if (data && kind !== 'image') fail()
  if (data) result.imageData = data
  discardUploadLease(value, result)
  return result
}

export function draftRecord(raw: unknown): DraftCustodyRecord {
  const value = object(raw), address = draftAddress(value)
  if (value.version !== 1 || !Array.isArray(value.attachments) || value.attachments.length > 64) return fail()
  const attachments = value.attachments.map(draftAttachment), images = attachments.flatMap(item => item.imageData ? [item.imageData] : [])
  if (new Set(attachments.map(item => item.occurrenceId || item.id)).size !== attachments.length) fail()
  const bytes = images.reduce((sum, item) => sum + decodedImageSize(item.dataBase64), 0)
  if (images.length > 4 || bytes > MAX_IMAGES_BYTES) fail()
  return { ...address, version: 1, attachments }
}
