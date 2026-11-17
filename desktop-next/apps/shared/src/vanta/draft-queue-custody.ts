import { draftAddress, draftRecord, type DraftAddress, type DraftAttachment } from './draft-custody'
import { draftLease, draftSnapshot, revision, sameDraftOwner, type DraftLease, type DraftSnapshot } from './draft-custody-protocol'
export const MAX_DRAFT_QUEUE_LEDGER_RECORDS = 4096

export interface DraftQueueAddress extends DraftAddress { entryId: string }
export interface DraftQueueEntry {
  id: string
  text: string
  displayText?: string
  displayKind?: 'hidden'
  queuedAt: number
  attachments: DraftAttachment[]
}
export type DraftQueueStatus = 'staging' | 'queued' | 'sending' | 'unknown' | 'accepted' | 'removed'
export interface DraftQueueAccepted { runtimeSessionId: string; storedSessionId: string | null }
export interface DraftQueueTextQuote { scope: string; revision: string }
export interface DraftQueueEnvelope {
  version: 1
  address: DraftQueueAddress
  lease: DraftLease
  revision: string
  status: DraftQueueStatus
  entry: DraftQueueEntry
  origin: { address: DraftAddress; revision: string | null; hashes: string[]; sourceTextRevision: string; sourceTextScope: string }
  attemptId?: string
  accepted?: DraftQueueAccepted
}
export interface DraftQueueStage { address: DraftQueueAddress; source: DraftSnapshot; entry: DraftQueueEntry; sourceTextRevision: string; sourceTextScope: string }
export interface DraftQueueQuote { address: DraftQueueAddress; lease: DraftLease; revision: string }
/** A renderer projection pointer, never a saved lease or dispatch authority. */
export interface DraftQueueReceipt { address: DraftQueueAddress; revision: string; status: DraftQueueStatus }
export interface DraftQueueUpdate extends DraftQueueQuote { entry: DraftQueueEntry }
export interface DraftQueueBegin extends DraftQueueQuote { attemptId: string }
export interface DraftQueueFinish extends DraftQueueBegin { outcome: 'accepted' | 'rejected' | 'unknown'; accepted?: DraftQueueAccepted }
export interface DraftQueueApi {
  stage(request: DraftQueueStage): Promise<DraftQueueEnvelope>
  list(address: DraftAddress, lease: DraftLease): Promise<DraftQueueEnvelope[]>
  read(request: DraftQueueQuote): Promise<DraftQueueEnvelope>
  update(request: DraftQueueUpdate): Promise<DraftQueueEnvelope>
  begin(request: DraftQueueBegin): Promise<DraftQueueEnvelope>
  finish(request: DraftQueueFinish): Promise<DraftQueueEnvelope>
  remove(request: DraftQueueQuote): Promise<DraftQueueEnvelope>
}

const invalid = (): never => { throw new Error('Invalid queued attachment custody; saved bytes were retained.') }
const object = (raw: unknown): Record<string, unknown> => raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : invalid()
const text = (raw: unknown, maximum: number): string => typeof raw === 'string' && raw.length <= maximum && !raw.includes('\0') ? raw : invalid()
const uuid = (raw: unknown): string => revision(raw) ?? invalid()
const id = (raw: unknown): string => text(raw, 512) || invalid()
const ownerMatches = (address: DraftAddress, lease: DraftLease) => { if (!sameDraftOwner(address.owner, lease.owner)) invalid() }
const acceptedIdentity = (raw: unknown): DraftQueueAccepted => {
  const value = object(raw), runtimeSessionId = text(value.runtimeSessionId, 2048) || invalid()
  return { runtimeSessionId, storedSessionId: value.storedSessionId === null ? null : text(value.storedSessionId, 2048) || invalid() }
}

export function draftQueueAddress(raw: unknown): DraftQueueAddress {
  const value = object(raw)
  return { ...draftAddress(value), entryId: id(value.entryId) }
}
export function draftQueueEntry(raw: unknown, address: DraftQueueAddress): DraftQueueEntry {
  const value = object(raw)
  if (value.id !== address.entryId || typeof value.queuedAt !== 'number' || !Number.isFinite(value.queuedAt) || value.queuedAt < 0) invalid()
  if (value.displayKind !== undefined && value.displayKind !== 'hidden') invalid()
  return { id: address.entryId, text: text(value.text, 4 * 1024 * 1024), queuedAt: value.queuedAt as number,
    attachments: draftRecord({ ...address, version: 1, attachments: value.attachments }).attachments,
    ...(value.displayText === undefined ? {} : { displayText: text(value.displayText, 4 * 1024 * 1024) }),
    ...(value.displayKind === 'hidden' ? { displayKind: 'hidden' as const } : {}) }
}
export function draftQueueQuote(raw: unknown): DraftQueueQuote {
  const value = object(raw), address = draftQueueAddress(value.address), lease = draftLease(value.lease)
  ownerMatches(address, lease)
  return { address, lease, revision: uuid(value.revision) }
}
export function draftQueueStage(raw: unknown): DraftQueueStage {
  const value = object(raw), address = draftQueueAddress(value.address), source = draftSnapshot(value.source)
  ownerMatches(address, source.lease)
  return { address, source, entry: draftQueueEntry(value.entry, address), sourceTextRevision: uuid(value.sourceTextRevision), sourceTextScope: text(value.sourceTextScope, 2048) || invalid() }
}
export function draftQueueUpdate(raw: unknown): DraftQueueUpdate {
  const quote = draftQueueQuote(raw)
  return { ...quote, entry: draftQueueEntry(object(raw).entry, quote.address) }
}
export function draftQueueBegin(raw: unknown): DraftQueueBegin {
  return { ...draftQueueQuote(raw), attemptId: uuid(object(raw).attemptId) }
}
export function draftQueueFinish(raw: unknown): DraftQueueFinish {
  const request = draftQueueBegin(raw), outcome = object(raw).outcome
  if (outcome !== 'accepted' && outcome !== 'rejected' && outcome !== 'unknown') invalid()
  if (outcome !== 'accepted' && object(raw).accepted !== undefined) invalid()
  return { ...request, outcome: outcome as DraftQueueFinish['outcome'], ...(outcome === 'accepted' ? { accepted: acceptedIdentity(object(raw).accepted) } : {}) }
}
function queueOrigin(raw: unknown, lease: DraftLease): DraftQueueEnvelope['origin'] {
  const origin = object(raw)
  const address = draftAddress(origin.address)
  ownerMatches(address, lease)
  if (!Array.isArray(origin.hashes) || origin.hashes.length > 64 || origin.hashes.some(hash => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))) invalid()
  return { address, revision: revision(origin.revision), hashes: origin.hashes as string[], sourceTextRevision: uuid(origin.sourceTextRevision), sourceTextScope: text(origin.sourceTextScope, 2048) || invalid() }
}
function requireDeliveryStatus(status: unknown, attemptId: string | undefined, accepted: DraftQueueAccepted | undefined): void {
  if (['sending', 'unknown', 'accepted'].includes(String(status)) && !attemptId) invalid()
  if (status === 'accepted' && !accepted) invalid()
  if (accepted && !['accepted', 'removed'].includes(String(status))) invalid()
}
function queueDelivery(value: Record<string, unknown>): Pick<DraftQueueEnvelope, 'attemptId' | 'accepted'> {
  const attemptId = value.attemptId === undefined ? undefined : uuid(value.attemptId)
  const accepted = value.accepted === undefined ? undefined : acceptedIdentity(value.accepted)
  requireDeliveryStatus(value.status, attemptId, accepted)
  return { ...(attemptId ? { attemptId } : {}), ...(accepted ? { accepted } : {}) }
}
export function draftQueueEnvelope(raw: unknown): DraftQueueEnvelope {
  const value = object(raw), quote = draftQueueQuote(value)
  if (value.version !== 1 || !['staging', 'queued', 'sending', 'unknown', 'accepted', 'removed'].includes(String(value.status))) invalid()
  const delivery = queueDelivery(value)
  return { version: 1, ...quote, status: value.status as DraftQueueStatus, entry: draftQueueEntry(value.entry, quote.address),
    origin: queueOrigin(value.origin, quote.lease), ...delivery }
}
