import { draftAddress } from '../../../shared/src/vanta/draft-custody'
import type { DraftSendTicket } from '../../../shared/src/vanta/draft-custody-protocol'

export interface SavedDraftSend {
  id: string
  hashes: string[]
  attachmentIds: string[]
  text: string
  rejected?: true
  handoff?: true
}
const invalid = (): never => { throw new Error('Saved submission checkpoint is invalid; bytes retained.') }
function savedList(raw: unknown, valid: (value: unknown) => boolean): string[] {
  if (!Array.isArray(raw) || raw.length > 64 || raw.some(value => !valid(value))) return invalid()
  return raw as string[]
}
function savedFlags(value: Record<string, unknown>): Pick<SavedDraftSend, 'rejected' | 'handoff'> {
  if (value.rejected !== undefined && value.rejected !== true) throw new Error('Invalid saved submission outcome; bytes retained.')
  if (value.handoff !== undefined && value.handoff !== true) throw new Error('Invalid saved submission outcome; bytes retained.')
  return { ...(value.rejected ? { rejected: true } : {}), ...(value.handoff ? { handoff: true } : {}) }
}
export function savedDraftSend(raw: unknown): SavedDraftSend | null {
  if (raw === null) return null
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid()
  const value = raw as Record<string, unknown>
  if (typeof value.id !== 'string' || !/^[a-f0-9-]{36}$/.test(value.id)) return invalid()
  const hashes = savedList(value.hashes, hash => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash))
  const attachmentIds = savedList(value.attachmentIds, id => typeof id === 'string' && id.length <= 8192)
  if (typeof value.text !== 'string' || value.text.length > 4 * 1024 * 1024) return invalid()
  return { id: value.id, hashes, attachmentIds, text: value.text, ...savedFlags(value) }
}
const assignmentChanged = (): never => { throw new Error('Submission assignment changed; saved bytes retained.') }
function assignedSession(raw: unknown): string {
  if (typeof raw !== 'string' || !raw || raw.length > 2048 || raw.includes('\0')) return assignmentChanged()
  return raw
}
export function requireSendAssignment(value: Record<string, unknown> | null, ticket: DraftSendTicket, assigned: unknown): void {
  if (!value || value.id !== ticket.id || value.generation !== ticket.lease.generation || JSON.stringify(draftAddress(value.origin)) !== JSON.stringify(ticket.address)) assignmentChanged()
  const session = assignedSession(assigned)
  if (value!.assignedSession !== undefined && value!.assignedSession !== session) assignmentChanged()
}
