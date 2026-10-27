import { randomUUID } from 'node:crypto'
import { draftAddress, MAX_DRAFT_CUSTODY_RECORDS, type DraftAddress } from '../../../shared/src/vanta/draft-custody'
import { draftLease, sameDraftOwner, type DraftLease, type DraftSnapshot } from '../../../shared/src/vanta/draft-custody-protocol'
import { draftQueueBegin, draftQueueEnvelope, draftQueueFinish, draftQueueQuote, draftQueueStage, draftQueueUpdate, MAX_DRAFT_QUEUE_LEDGER_RECORDS, type DraftQueueAddress, type DraftQueueBegin, type DraftQueueEnvelope, type DraftQueueFinish, type DraftQueueQuote, type DraftQueueStage, type DraftQueueUpdate } from '../../../shared/src/vanta/draft-queue-custody'
import { custodyDigest, type createCustodyFiles } from './draft-custody-files'

export interface DraftQueueCustodyDeps {
  files: ReturnType<typeof createCustodyFiles>
  assertLease(lease: DraftLease): Promise<void>
  readDraft(address: DraftAddress, lease: DraftLease): Promise<DraftSnapshot>
  consumeDraft(request: { address: DraftAddress; lease: DraftLease; hashes: string[] }): Promise<void>
}
const key = (address: DraftQueueAddress) => custodyDigest([address.owner, address.session, address.entryId]) + '.queue.json'
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
const conflict = (): never => { throw new Error('custody_conflict: The queued attachment changed; saved bytes were retained.') }
const occurrence = (item: { id: string; occurrenceId?: string }) => item.occurrenceId || item.id
const terminalEntry = (value: DraftQueueEnvelope) => ({ id: value.entry.id, queuedAt: value.entry.queuedAt, text: '', attachments: [] })

/** Called exclusively inside DraftCustody's existing native serial lane. */
export class DraftQueueCustody {
  private readonly inFlight = new Set<string>()
  constructor(private readonly deps: DraftQueueCustodyDeps) {}
  private async saved(address: DraftQueueAddress, lease: DraftLease): Promise<DraftQueueEnvelope | null> {
    if (!sameDraftOwner(address.owner, lease.owner)) conflict()
    await this.deps.assertLease(lease)
    const raw = await this.deps.files.read(key(address))
    if (raw === null) return null
    const value = draftQueueEnvelope(raw)
    if (!same(value.address, address) || !same(value.lease, lease)) conflict()
    return value
  }
  private async quoted(raw: unknown): Promise<DraftQueueEnvelope> {
    const quote = draftQueueQuote(raw), saved = await this.saved(quote.address, quote.lease)
    if (!saved || saved.revision !== quote.revision) conflict()
    return saved!
  }
  private async write(value: DraftQueueEnvelope): Promise<DraftQueueEnvelope> {
    const saved = draftQueueEnvelope({ ...value, revision: randomUUID() })
    await this.deps.files.write(key(saved.address), saved)
    return saved
  }
  private async recover(value: DraftQueueEnvelope): Promise<DraftQueueEnvelope> {
    if (value.status === 'staging') {
      await this.deps.consumeDraft({ address: value.origin.address, lease: value.lease, hashes: value.origin.hashes })
      return this.write({ ...value, status: 'queued' })
    }
    if (value.status === 'sending' && !this.inFlight.has(key(value.address))) return this.write({ ...value, status: 'unknown' })
    return value
  }
  private async all(lease: DraftLease): Promise<DraftQueueEnvelope[]> {
    await this.deps.assertLease(lease)
    const values: DraftQueueEnvelope[] = []
    for (const name of (await this.deps.files.entries()).filter(name => /^[a-f0-9]{64}\.queue\.json$/.test(name))) {
      const value = draftQueueEnvelope(await this.deps.files.read(name))
      if (name !== key(value.address)) throw new Error('Queued attachment filename does not match its identity; bytes retained.')
      if (sameDraftOwner(value.address.owner, lease.owner)) {
        if (!same(value.lease, lease)) conflict()
        values.push(value)
      }
    }
    return values
  }
  async recoverForDraft(raw: DraftAddress, captured: DraftLease): Promise<void> {
    const address = draftAddress(raw), lease = draftLease(captured)
    if (!sameDraftOwner(address.owner, lease.owner)) conflict()
    for (const value of await this.all(lease)) {
      if (same(value.origin.address, address)) await this.recover(value)
    }
  }
  async consumedSourceTextRevisions(raw: DraftAddress, captured: DraftLease): Promise<Array<{ scope: string; revision: string }>> {
    const address = draftAddress(raw), lease = draftLease(captured)
    if (!sameDraftOwner(address.owner, lease.owner)) conflict()
    const markers = (await this.all(lease)).filter(value => same(value.origin.address, address) && value.status !== 'staging')
      .map(value => ({ scope: value.origin.sourceTextScope, revision: value.origin.sourceTextRevision }))
    return markers.filter((marker, index) => markers.findIndex(value => same(value, marker)) === index)
  }
  private async resumeStage(existing: DraftQueueEnvelope, request: DraftQueueStage): Promise<DraftQueueEnvelope> {
    const matches = [same(existing.entry, request.entry), same(existing.origin.address, request.source.address),
      existing.origin.revision === request.source.revision, existing.origin.sourceTextRevision === request.sourceTextRevision,
      existing.origin.sourceTextScope === request.sourceTextScope, existing.status !== 'removed']
    if (!matches.every(Boolean)) conflict()
    return this.recover(existing)
  }
  private async selected(request: DraftQueueStage) {
    const current = await this.deps.readDraft(request.source.address, request.source.lease)
    if (current.revision !== request.source.revision) conflict()
    const ids = request.entry.attachments.map(occurrence)
    if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => current.pendingSend?.attachmentIds.includes(id))) conflict()
    const selected = ids.map(id => current.attachments.find(item => occurrence(item) === id))
    if (selected.some((item, index) => !item || !same(item, request.entry.attachments[index]))) conflict()
    return selected
  }
  private async checkCapacity(lease: DraftLease): Promise<void> {
    const ledger = await this.all(lease)
    if (ledger.length >= MAX_DRAFT_QUEUE_LEDGER_RECORDS) throw new Error('Saved attachment queue history is full; no checkpoint was evicted and the draft was retained.')
    if (ledger.filter(value => !['accepted', 'removed'].includes(value.status)).length >= MAX_DRAFT_CUSTODY_RECORDS) throw new Error('Saved attachment queue is full; the draft was retained.')
  }
  async stage(raw: DraftQueueStage): Promise<DraftQueueEnvelope> {
    const request = draftQueueStage(raw), { address, source, entry } = request
    const existing = await this.saved(address, source.lease)
    if (existing) return this.resumeStage(existing, request)
    const selected = await this.selected(request)
    await this.checkCapacity(source.lease)
    const staged = await this.write({ version: 1, address, lease: source.lease, revision: randomUUID(), status: 'staging', entry,
      origin: { address: source.address, revision: source.revision, hashes: selected.map(custodyDigest), sourceTextRevision: request.sourceTextRevision, sourceTextScope: request.sourceTextScope } })
    return this.recover(staged)
  }
  async list(raw: DraftAddress, captured: DraftLease): Promise<DraftQueueEnvelope[]> {
    const address = draftAddress(raw), lease = draftLease(captured)
    if (!sameDraftOwner(address.owner, lease.owner)) conflict()
    const values = (await this.all(lease)).filter(value => value.address.session === address.session)
    const recovered: DraftQueueEnvelope[] = []
    for (const value of values) recovered.push(await this.recover(value))
    return recovered
  }
  async read(raw: DraftQueueQuote): Promise<DraftQueueEnvelope> { return this.recover(await this.quoted(raw)) }
  async update(raw: DraftQueueUpdate): Promise<DraftQueueEnvelope> {
    const request = draftQueueUpdate(raw), current = await this.quoted(request)
    if (current.status !== 'queued') conflict()
    return this.write({ ...current, entry: request.entry })
  }
  async begin(raw: DraftQueueBegin): Promise<DraftQueueEnvelope> {
    const request = draftQueueBegin(raw), current = await this.quoted(request)
    if (current.status !== 'queued') conflict()
    const saved = await this.write({ ...current, status: 'sending', attemptId: request.attemptId })
    this.inFlight.add(key(saved.address))
    return saved
  }
  async finish(raw: DraftQueueFinish): Promise<DraftQueueEnvelope> {
    const request = draftQueueFinish(raw), current = await this.quoted(request)
    if (!['sending', 'unknown'].includes(current.status) || current.attemptId !== request.attemptId) conflict()
    try { return await this.write({ ...current, status: request.outcome === 'rejected' ? 'queued' : request.outcome,
      ...(request.accepted ? { accepted: request.accepted, entry: terminalEntry(current) } : {}) }) }
    finally { this.inFlight.delete(key(current.address)) }
  }
  async remove(raw: DraftQueueQuote): Promise<DraftQueueEnvelope> {
    const current = await this.quoted(raw)
    if (current.status === 'staging' || this.inFlight.has(key(current.address))) conflict()
    return this.write({ ...current, status: 'removed', entry: terminalEntry(current) })
  }
}
export const createDraftQueueCustody = (deps: DraftQueueCustodyDeps) => new DraftQueueCustody(deps)
