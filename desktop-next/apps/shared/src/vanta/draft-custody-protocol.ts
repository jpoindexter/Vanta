import { draftAddress, draftRecord, type DraftAddress, type DraftAttachment, type DraftOwner } from './draft-custody'
import { MAX_DRAFT_QUEUE_LEDGER_RECORDS } from './draft-queue-custody'

export interface DraftLease { owner: DraftOwner; generation: string }
export interface DraftPendingSend { id: string; attachmentIds: string[]; text: string; rejected?: true; handoff?: true }
export interface DraftSnapshot { address: DraftAddress; lease: DraftLease; revision: string | null; attachments: DraftAttachment[]; pendingSend?: DraftPendingSend; consumedText?: { scope: string; revision: string }[]; recoveries?: DraftAddress[] }
export type DraftOpenResult = { status: 'ready'; snapshot: DraftSnapshot } | { status: 'pending' | 'retired'; address: DraftAddress; lease: DraftLease }
export interface DraftWrite { address: DraftAddress; lease: DraftLease; expectedRevision: string | null; attachments: DraftAttachment[] }
export interface DraftMove { from: DraftSnapshot; to: DraftSnapshot; restoreInterrupted?: boolean }
export interface DraftSendTicket { address: DraftAddress; lease: DraftLease; revision: string | null; id: string; attachmentIds: string[]; text: string }
export function draftSendTicket(raw: unknown): DraftSendTicket {
  const value = record(raw), address = draftAddress(value.address), lease = draftLease(value.lease)
  if (!sameDraftOwner(address.owner, lease.owner) || !Array.isArray(value.attachmentIds) || value.attachmentIds.length > 64 || value.attachmentIds.some(id => typeof id !== 'string' || id.length > 8192) || typeof value.text !== 'string' || value.text.length > 4 * 1024 * 1024) throw new Error('Invalid submission checkpoint.')
  return { address, lease, revision: revision(value.revision), id: token(value.id), attachmentIds: value.attachmentIds as string[], text: value.text }
}
export type DraftOwnerStatus = 'active' | 'pending' | 'retired'
export interface DraftOwnerState { owner: DraftOwner; generation: string; status: DraftOwnerStatus; archiveAttempt?: string }

const record = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid draft custody request.')
  return raw as Record<string, unknown>
}
const token = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[a-f0-9-]{36}$/.test(value)) throw new Error('Invalid draft custody token.')
  return value
}
export const revision = (raw: unknown): string | null => raw === null ? null : token(raw)
export const sameDraftOwner = (left: DraftOwner, right: DraftOwner) => left.connectionId === right.connectionId && left.profile === right.profile
export function draftLease(raw: unknown): DraftLease {
  const value = record(raw), address = draftAddress({ owner: value.owner, session: '__lease__' })
  return { owner: address.owner, generation: token(value.generation) }
}
export function draftWrite(raw: unknown): DraftWrite {
  const value = record(raw), address = draftAddress(value.address), lease = draftLease(value.lease)
  if (!sameDraftOwner(address.owner, lease.owner)) throw new Error('Draft custody owner does not match.')
  const attachments = draftRecord({ ...address, version: 1, attachments: value.attachments }).attachments
  return { address, lease, expectedRevision: revision(value.expectedRevision), attachments }
}
function snapshotRecoveries(raw: unknown, owner: DraftOwner): DraftAddress[] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw) || raw.length > 50) throw new Error('Invalid saved recovery list.')
  const recoveries = raw.map(draftAddress)
  if (recoveries.some(address => !sameDraftOwner(address.owner, owner))) throw new Error('Saved recovery owner does not match.')
  return recoveries
}
function snapshotConsumedText(consumed: unknown): DraftSnapshot['consumedText'] {
  if (consumed !== undefined && (!Array.isArray(consumed) || consumed.length > MAX_DRAFT_QUEUE_LEDGER_RECORDS)) throw new Error('Invalid saved text consumption.')
  return (consumed as unknown[] | undefined)?.map(raw => {
    const item = record(raw)
    if (typeof item.scope !== 'string' || !item.scope || item.scope.length > 8192) throw new Error('Invalid saved text scope.')
    return { scope: item.scope, revision: token(item.revision) }
  })
}
function snapshotPending(raw: unknown): DraftPendingSend | undefined {
  if (!raw) return undefined
  const pending = record(raw)
  if (!Array.isArray(pending.attachmentIds) || pending.attachmentIds.some(id => typeof id !== 'string' || id.length > 8192) || typeof pending.text !== 'string' || pending.text.length > 4 * 1024 * 1024) throw new Error('Invalid saved submission checkpoint.')
  return { id: token(pending.id), attachmentIds: pending.attachmentIds as string[], text: pending.text,
    ...(pending.rejected === true ? { rejected: true as const } : {}), ...(pending.handoff === true ? { handoff: true as const } : {}) }
}
export function draftSnapshot(raw: unknown): DraftSnapshot {
  const value = record(raw), write = draftWrite({ ...value, expectedRevision: value.revision })
  const recoveries = snapshotRecoveries(value.recoveries, write.address.owner)
  const consumedText = snapshotConsumedText(value.consumedText), pendingSend = snapshotPending(value.pendingSend)
  return { address: write.address, lease: write.lease, revision: write.expectedRevision, attachments: write.attachments,
    ...(consumedText ? { consumedText } : {}), ...(recoveries ? { recoveries } : {}), ...(pendingSend ? { pendingSend } : {}) }
}
export function draftOwnerState(raw: unknown): DraftOwnerState {
  const value = record(raw), lease = draftLease(value)
  if (!['active', 'pending', 'retired'].includes(String(value.status))) throw new Error('Invalid saved draft custody lifecycle.')
  return { ...lease, status: value.status as DraftOwnerStatus, ...(value.archiveAttempt === undefined ? {} : { archiveAttempt: token(value.archiveAttempt) }) }
}
