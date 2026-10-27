import { randomUUID } from 'node:crypto'
import { draftAddress, MAX_DRAFT_CUSTODY_BYTES, MAX_DRAFT_CUSTODY_RECORDS, type DraftAddress, type DraftOwner } from '../../../shared/src/vanta/draft-custody'
import { draftLease, draftOwnerState, draftSendTicket, draftSnapshot, draftWrite, sameDraftOwner, type DraftLease, type DraftMove, type DraftOpenResult, type DraftOwnerState, type DraftSnapshot, type DraftSendTicket } from '../../../shared/src/vanta/draft-custody-protocol'
import { createCustodyFiles, custodyDigest } from './draft-custody-files'
import { createDraftQueueCustody } from './draft-queue-custody'
import type { DraftQueueApi } from '../../../shared/src/vanta/draft-queue-custody'
import { requireSendAssignment, savedDraftSend, type SavedDraftSend } from './draft-send-record'

export interface DraftCustodyDeps { root: string; profileIsActive: (profile: string) => Promise<boolean> }
const ownerKey = (owner: DraftOwner) => custodyDigest(owner) + '.owner.json'
const draftKey = (address: DraftAddress) => custodyDigest(address) + '.draft.json'
const sendKey = (address: DraftAddress) => custodyDigest(address) + '.send.json'
const requireLocal = (owner: DraftOwner) => { if (owner.connectionId !== 'local') throw new Error('custody_unsupported: Draft durability is not supported for this connection; live attachments remain in this window.') }

/** Serialized native custody, not agent action authority. No lease refresh on write/retry. */
export class DraftCustody {
  private readonly files: ReturnType<typeof createCustodyFiles>
  private tail: Promise<unknown> = Promise.resolve()
  private readonly archiveRequestsInFlight = new Set<string>()
  private readonly sendsInFlight = new Set<string>()
  private readonly queued
  readonly queue: DraftQueueApi
  constructor(private readonly deps: DraftCustodyDeps) {
    this.files = createCustodyFiles(deps.root)
    this.queued = createDraftQueueCustody({ files: this.files,
      assertLease: async lease => { await this.requireLease(lease) },
      readDraft: (address, lease) => this.readSnapshot(address, lease),
      consumeDraft: request => this.consumeQueuedDraft(request) })
    const queued = this.queued
    this.queue = {
      stage: request => this.serial(() => queued.stage(request)), list: (address, lease) => this.serial(() => queued.list(address, lease)),
      read: request => this.serial(() => queued.read(request)), update: request => this.serial(() => queued.update(request)),
      begin: request => this.serial(() => queued.begin(request)), finish: request => this.serial(() => queued.finish(request)),
      remove: request => this.serial(() => queued.remove(request)) }
  }
  private serial<T>(action: () => Promise<T>): Promise<T> {
    const next = this.tail.then(action); this.tail = next.catch(() => undefined); return next
  }
  private async owner(owner: DraftOwner): Promise<DraftOwnerState | null> {
    requireLocal(owner)
    const raw = await this.files.read(ownerKey(owner))
    if (raw === null) return null
    const state = draftOwnerState(raw)
    if (!sameDraftOwner(state.owner, owner)) throw new Error('Saved custody owner does not match.')
    return state
  }
  private async requireLease(lease: DraftLease): Promise<DraftOwnerState> {
    const state = await this.owner(lease.owner)
    if (!state || state.generation !== lease.generation || state.status !== 'active') throw new Error('custody_lifecycle: Draft custody lifecycle changed; stale writes are blocked and saved bytes are retained.')
    return state
  }
  private async readSnapshot(address: DraftAddress, lease: DraftLease): Promise<DraftSnapshot> {
    if (!sameDraftOwner(address.owner, lease.owner)) throw new Error('Draft custody owner does not match.')
    await this.requireLease(lease)
    const raw = await this.files.read(draftKey(address))
    const saved = raw === null ? { address, lease, revision: null, attachments: [] } : draftSnapshot(raw)
    if (JSON.stringify(saved.address) !== JSON.stringify(address) || saved.lease.generation !== lease.generation) throw new Error('Saved draft custody identity does not match.')
    const pending = await this.pendingSend(address)
    const consumedText = await this.queued.consumedSourceTextRevisions(address, lease)
    return { ...saved, consumedText, recoveries: await this.recoverySources(address, lease), ...(pending ? { pendingSend: { id: pending.id, attachmentIds: pending.attachmentIds, text: pending.text, ...(pending.rejected ? { rejected: true as const } : {}), ...(pending.handoff ? { handoff: true as const } : {}) } } : {}) }
  }
  private async recoverySources(address: DraftAddress, lease: DraftLease): Promise<DraftAddress[]> {
    const sources: DraftAddress[] = []
    for (const name of (await this.files.entries()).filter(name => /^[a-f0-9]{64}\.send\.json$/.test(name))) {
      const value = await this.files.read(name) as { origin?: unknown; generation?: unknown; assignedSession?: unknown }
      if (value.origin === undefined || value.assignedSession !== address.session || value.generation !== lease.generation) continue
      const origin = draftAddress(value.origin)
      if (name !== sendKey(origin)) throw new Error('Saved recovery identity does not match; bytes retained.')
      if (sameDraftOwner(origin.owner, address.owner) && JSON.stringify(origin) !== JSON.stringify(address)) sources.push(origin)
    }
    if (sources.length > 50) throw new Error('Saved recovery limit exceeded; bytes retained.')
    return sources
  }
  private async pendingSend(address: DraftAddress): Promise<SavedDraftSend | null> {
    return savedDraftSend(await this.files.read(sendKey(address)))
  }
  private async consumeQueuedDraft(request: { address: DraftAddress; lease: DraftLease; hashes: string[] }): Promise<void> {
    const current = await this.readSnapshot(request.address, request.lease)
    const kept = current.attachments.filter(item => !request.hashes.includes(custodyDigest(item)))
    if (kept.length === current.attachments.length) return
    await this.writeSnapshot({ address: current.address, lease: current.lease, expectedRevision: current.revision, attachments: kept })
  }
  private async writeSnapshot(raw: unknown, finishingSend = false): Promise<DraftSnapshot> {
    const request = draftWrite(raw), previous = await this.readSnapshot(request.address, request.lease)
    if (previous.revision !== request.expectedRevision) throw new Error('custody_conflict: Draft changed in another window; review saved changes before retrying.')
    const pending = await this.pendingSend(request.address)
    if (pending && !finishingSend && pending.hashes.some(hash => !request.attachments.some(item => custodyDigest(item) === hash))) throw new Error('custody_pending_send: Submitted attachments remain pinned until the send outcome is known.')
    const key = draftKey(request.address)
    const next: DraftSnapshot = { address: request.address, lease: request.lease, revision: randomUUID(), attachments: request.attachments }
    const entries = (await this.files.entries()).filter(name => /^[a-f0-9]{64}\.draft\.json$/.test(name) && name !== key)
    const sizes = await Promise.all(entries.map(this.files.size))
    const snapshots = await Promise.all(entries.map(async name => draftSnapshot(await this.files.read(name))))
    const liveCount = snapshots.filter(value => value.attachments.length > 0).length + Number(next.attachments.length > 0)
    if (liveCount > MAX_DRAFT_CUSTODY_RECORDS || sizes.reduce((sum, size) => sum + size, Buffer.byteLength(JSON.stringify(next))) > MAX_DRAFT_CUSTODY_BYTES) throw new Error('Saved attachment storage is full; existing drafts were not removed.')
    await this.files.write(key, next)
    return this.readSnapshot(next.address, next.lease)
  }
  open(raw: unknown): Promise<DraftOpenResult> {
    return this.serial(async () => {
      const address = draftAddress(raw); requireLocal(address.owner)
      let state = await this.owner(address.owner)
      if (!state) {
        if (!await this.deps.profileIsActive(address.owner.profile)) throw new Error('Profile identity could not be established; saved bytes retained.')
        state = { owner: address.owner, generation: randomUUID(), status: 'active' }
        await this.files.write(ownerKey(address.owner), state)
      }
      const lease = { owner: state.owner, generation: state.generation }
      if (state.status !== 'active') return { status: state.status, address, lease }
      await this.queued.recoverForDraft(address, lease)
      return { status: 'ready', snapshot: await this.readSnapshot(address, lease) }
    })
  }
  read(raw: unknown, lease: unknown): Promise<DraftSnapshot> {
    return this.serial(async () => {
      const address = draftAddress(raw), captured = draftLease(lease)
      await this.queued.recoverForDraft(address, captured)
      return this.readSnapshot(address, captured)
    })
  }
  write(raw: unknown): Promise<DraftSnapshot> { return this.serial(() => this.writeSnapshot(raw)) }
  private requireMovableSubmission(source: DraftSnapshot, target: DraftSnapshot, restoreInterrupted: boolean): void {
    const pending = source.pendingSend
    const active = pending && this.sendsInFlight.has(custodyDigest([source.address, pending.id]))
    if (target.pendingSend || (pending && (!restoreInterrupted || active))) throw new Error('custody_pending_send: Submission custody cannot move before its outcome is known.')
  }
  move(raw: DraftMove): Promise<DraftSnapshot> {
    return this.serial(async () => {
      const from = draftSnapshot(raw.from), to = draftSnapshot(raw.to)
      if (!sameDraftOwner(from.address.owner, to.address.owner) || from.lease.generation !== to.lease.generation) throw new Error('Cannot move custody across owners.')
      const source = await this.readSnapshot(from.address, from.lease), target = await this.readSnapshot(to.address, to.lease)
      this.requireMovableSubmission(source, target, raw.restoreInterrupted === true)
      if (source.revision !== from.revision || target.revision !== to.revision) throw new Error('Draft changed before move; both saved copies retained.')
      if (JSON.stringify(from.address) === JSON.stringify(to.address)) return source
      if (target.attachments.length) throw new Error('Destination has saved attachments; both drafts retained.')
      const saved = await this.writeSnapshot({ address: to.address, lease: to.lease, expectedRevision: to.revision, attachments: source.attachments })
      const pending = await this.pendingSend(source.address)
      if (pending) await this.files.write(sendKey(target.address), { ...pending, origin: target.address, generation: target.lease.generation })
      await this.writeSnapshot({ address: from.address, lease: from.lease, expectedRevision: from.revision, attachments: [] }, Boolean(pending))
      if (pending) await this.files.remove(sendKey(source.address))
      return pending ? this.readSnapshot(target.address, target.lease) : saved
    })
  }
  beginArchive(owner: DraftOwner): Promise<DraftOwnerState> {
    return this.serial(async () => {
      const exact = draftAddress({ owner, session: '__archive__' }).owner
      const previous = await this.owner(exact)
      if (previous && previous.status !== 'active') throw new Error('Previous archive result needs review; no backend retry was made.')
      const pending: DraftOwnerState = { owner: exact, generation: previous?.generation ?? randomUUID(), status: 'pending', archiveAttempt: randomUUID() }
      await this.files.write(ownerKey(exact), pending)
      this.archiveRequestsInFlight.add(pending.archiveAttempt!)
      return pending
    })
  }
  finishArchive(pending: DraftOwnerState, outcome: 'active' | 'retired' | 'unknown'): Promise<void> {
    return this.serial(async () => {
      const current = await this.owner(pending.owner)
      if (!current || current.archiveAttempt !== pending.archiveAttempt) throw new Error('Archive custody checkpoint changed; saved bytes retained.')
      try { if (outcome !== 'unknown') await this.files.write(ownerKey(current.owner), { owner: current.owner, generation: current.generation, status: outcome }) }
      finally { this.archiveRequestsInFlight.delete(pending.archiveAttempt!) }
    })
  }
  recover(raw: unknown, lease: unknown): Promise<DraftSnapshot> {
    return this.serial(async () => {
      const address = draftAddress(raw), captured = draftLease(lease), current = await this.owner(address.owner)
      if (!current || !sameDraftOwner(captured.owner, current.owner) || captured.generation !== current.generation || current.status !== 'pending') throw new Error('This captured custody lease cannot be refreshed.')
      if (current.archiveAttempt && this.archiveRequestsInFlight.has(current.archiveAttempt)) throw new Error('Archive request is still running; custody recovery cannot re-enable writes.')
      const status = await this.deps.profileIsActive(current.owner.profile) ? 'active' : 'retired'
      await this.files.write(ownerKey(current.owner), { owner: current.owner, generation: current.generation, status })
      return this.readSnapshot(address, captured)
    })
  }
  beginSend(raw: DraftSendTicket): Promise<DraftSendTicket> {
    return this.serial(async () => {
      const ticket = draftSendTicket(raw), current = await this.readSnapshot(ticket.address, ticket.lease)
      if (current.revision !== ticket.revision || current.pendingSend) throw new Error('custody_conflict: Draft changed before submission; nothing was sent.')
      const attachments = current.attachments.filter(item => ticket.attachmentIds.includes(item.occurrenceId || item.id))
      if (new Set(attachments.map(item => item.occurrenceId || item.id)).size !== new Set(ticket.attachmentIds).size) throw new Error('Submitted attachments are not durably saved; nothing was sent.')
      if ((await this.files.entries()).filter(name => name.endsWith('.send.json')).length >= 50) throw new Error('Saved submission recovery is full; nothing was sent.')
      await this.files.write(sendKey(ticket.address), { id: ticket.id, hashes: attachments.map(custodyDigest), attachmentIds: ticket.attachmentIds, text: ticket.text, origin: ticket.address, generation: ticket.lease.generation })
      this.sendsInFlight.add(custodyDigest([ticket.address, ticket.id]))
      return ticket
    })
  }
  assignSend(raw: DraftSendTicket, assignedSession: unknown): Promise<void> {
    return this.serial(async () => {
      const ticket = draftSendTicket(raw)
      await this.requireLease(ticket.lease)
      await this.pendingSend(ticket.address)
      const key = sendKey(ticket.address), value = await this.files.read(key) as Record<string, unknown> | null
      requireSendAssignment(value, ticket, assignedSession)
      await this.files.write(key, { ...value, assignedSession })
    })
  }
  private async releaseSendPayload(ticket: DraftSendTicket, current: DraftSnapshot, pending: SavedDraftSend, outcome: 'accepted' | 'restore'): Promise<DraftSnapshot> {
    const kept = outcome === 'accepted' ? current.attachments.filter(item => !pending.hashes.includes(custodyDigest(item))) : current.attachments
    const saved = await this.writeSnapshot({ address: current.address, lease: current.lease, expectedRevision: current.revision, attachments: kept }, true)
    const checkpoint = await this.files.read(sendKey(ticket.address)) as Record<string, unknown>
    if (outcome === 'accepted' && kept.length && typeof checkpoint.assignedSession === 'string' && checkpoint.assignedSession !== ticket.address.session) {
      await this.files.write(sendKey(ticket.address), { ...checkpoint, id: randomUUID(), hashes: kept.map(custodyDigest), attachmentIds: kept.map(item => item.occurrenceId || item.id), text: '', handoff: true })
      return this.readSnapshot(ticket.address, ticket.lease)
    }
    await this.files.remove(sendKey(ticket.address))
    return { ...saved, pendingSend: undefined }
  }
  finishSend(raw: DraftSendTicket, outcome: 'accepted' | 'rejected' | 'restore' | 'unknown'): Promise<DraftSnapshot> {
    return this.serial(async () => {
      if (!['accepted', 'rejected', 'restore', 'unknown'].includes(outcome)) throw new Error('Invalid submission outcome.')
      const ticket = draftSendTicket(raw), current = await this.readSnapshot(ticket.address, ticket.lease), pending = await this.pendingSend(ticket.address)
      if (!pending || pending.id !== ticket.id) throw new Error('Submission checkpoint changed; saved bytes retained.')
      const key = custodyDigest([ticket.address, ticket.id])
      if (outcome === 'restore' && this.sendsInFlight.has(key)) throw new Error('The send is still running; review its result before restoring.')
      try {
        if (outcome === 'unknown') return current
        if (outcome === 'rejected') {
          const original = await this.files.read(sendKey(ticket.address)) as Record<string, unknown>
          await this.files.write(sendKey(ticket.address), { ...original, rejected: true })
          return this.readSnapshot(ticket.address, ticket.lease)
        }
        return await this.releaseSendPayload(ticket, current, pending, outcome)
      } finally { this.sendsInFlight.delete(key) }
    })
  }
}
export const createDraftCustody = (deps: DraftCustodyDeps) => new DraftCustody(deps)
