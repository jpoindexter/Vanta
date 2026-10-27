import { atom } from 'nanostores'
import { draftTextIdentity } from './draft-text-identity'

export const DRAFT_TEXT_STORAGE_KEY = 'desktop:composer-drafts:v4'
export const LEGACY_DRAFT_TEXT_STORAGE_KEY = 'desktop:composer-drafts:v3'
export interface DraftTextRecord { text: string; revision: string }
export interface DraftTextQuote { scope: string; revision: string }
export const $draftTextStorageUnavailable = atom(false)
const uuid = () => crypto.randomUUID()
const object = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Saved draft text is invalid.')
  return raw as Record<string, unknown>
}
function decode(raw: string): Map<string, DraftTextRecord> {
  const value = object(JSON.parse(raw)), drafts = object(value.drafts)
  if (value.version !== 4 || Object.keys(drafts).length > 50) throw new Error('Saved draft text is invalid.')
  return new Map(Object.entries(drafts).map(([scope, raw]) => {
    const record = object(raw)
    if (scope.length > 8192 || typeof record.text !== 'string' || record.text.length > 4 * 1024 * 1024 || typeof record.revision !== 'string' || !/^[a-f0-9-]{36}$/.test(record.revision)) throw new Error('Saved draft text is invalid.')
    draftTextIdentity(scope)
    return [scope, { text: record.text, revision: record.revision }]
  }))
}
function readDraftTextRecords(): Map<string, DraftTextRecord> {
  const current = window.localStorage.getItem(DRAFT_TEXT_STORAGE_KEY)
  if (current !== null) return decode(current)
  const legacy = window.localStorage.getItem(LEGACY_DRAFT_TEXT_STORAGE_KEY)
  if (legacy === null) return new Map()
  return new Map(Object.entries(object(JSON.parse(legacy))).filter(([, value]) => typeof value === 'string')
    .slice(-50).map(([scope, text]) => [scope, { text: text as string, revision: uuid() }]))
}

/** A failed read is not authoritative deletion of the last known drafts. */
export function loadDraftTextRecords(): Map<string, DraftTextRecord> | null {
  try {
    const records = readDraftTextRecords()
    $draftTextStorageUnavailable.set(false)
    return records
  } catch {
    $draftTextStorageUnavailable.set(true)
    return null
  }
}
/** Text + revision share one localStorage value. Existing invalid v4 bytes are never replaced. */
export function saveDraftTextRecords(records: Map<string, DraftTextRecord>): boolean {
  try {
    const previous = window.localStorage.getItem(DRAFT_TEXT_STORAGE_KEY)
    if (previous !== null) decode(previous)
    const value = JSON.stringify({ version: 4, drafts: Object.fromEntries(records) })
    decode(value)
    window.localStorage.setItem(DRAFT_TEXT_STORAGE_KEY, value)
    const saved = window.localStorage.getItem(DRAFT_TEXT_STORAGE_KEY) === value
    $draftTextStorageUnavailable.set(!saved)
    return saved
  } catch { $draftTextStorageUnavailable.set(true); return false }
}
