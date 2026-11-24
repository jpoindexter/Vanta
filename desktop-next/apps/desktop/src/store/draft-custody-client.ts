import { atom } from 'nanostores'
import { draftAddress, type DraftAddress } from '../../../shared/src/vanta/draft-custody'
import { draftLease, draftSnapshot, type DraftLease, type DraftSendTicket, type DraftSnapshot } from '../../../shared/src/vanta/draft-custody-protocol'
import type { ComposerAttachment } from './composer'
import { custodyOccurrence, custodyPayload, mergeCustodyIntent, restoreCustodyPreviews } from './draft-custody-merge'
import type { DraftQueueAddress, DraftQueueApi, DraftQueueEntry, DraftQueueEnvelope } from '../../../shared/src/vanta/draft-queue-custody'
import type { DraftTextQuote } from './draft-text-storage'

export type DraftCustodyApi = NonNullable<Window['desktopBridge']['draftAttachments']>
export type CustodyPhase = 'loading' | 'loading-image' | 'ready' | 'saving' | 'preparing' | 'sending' | 'conflict' | 'error' | 'pending-profile' | 'retired' | 'interrupted' | 'unsupported'
export interface CustodyView { phase: CustodyPhase; message: string }
export interface CustodyReservation { client: DraftCustodyClient; ticket?: DraftSendTicket; attachments: ComposerAttachment[]; text: string; textQuote?: DraftTextQuote; assignment?: Promise<void> }
const changedElsewhere = 'This draft changed in another window. Review and save the combined attachments before sending.'
const matchesAddress = (a: DraftAddress, b: DraftAddress) => JSON.stringify(a) === JSON.stringify(b)

/** One owner/address in this renderer. Native revisions arbitrate other windows. */
export class DraftCustodyClient {
  readonly address: DraftAddress
  readonly $attachments = atom<ComposerAttachment[]>([])
  readonly $view = atom<CustodyView>({ phase: 'loading', message: 'Restoring saved attachments. You can keep typing.' })
  readonly $restoredText = atom<string | null>(null)
  readonly $recoverySource = atom<DraftCustodyClient | null>(null)
  readonly $recoveryError = atom('')
  readonly $textReady = atom(true)
  readonly $queueReady = atom(true)
  private base?: DraftSnapshot
  private lease?: DraftLease
  private reservation?: CustodyReservation
  private writeInFlight: Promise<void> | null = null
  private started = false
  constructor(address: DraftAddress, private readonly api?: DraftCustodyApi) { this.address = draftAddress(address) }
  private view(phase: CustodyPhase, message = '') { this.$view.set({ phase, message }) }
  private validate(saved: DraftSnapshot): DraftSnapshot {
    const snapshot = draftSnapshot(saved)
    if (!matchesAddress(snapshot.address, this.address) || (this.lease && snapshot.lease.generation !== this.lease.generation)) throw new Error('Captured draft identity changed.')
    this.lease ??= snapshot.lease
    return snapshot
  }
  private desired(): ComposerAttachment[] {
    const live = this.$attachments.get(), pinned = this.reservation?.attachments ?? []
    return [...live, ...pinned.filter(item => !live.some(value => custodyOccurrence(value) === custodyOccurrence(item)))]
  }
  private fail(error: unknown) {
    const message = String((error as Error)?.message || error)
    if (message.includes('custody_image_loading')) this.view('loading-image', 'Image bytes are still loading. Keep this window open; sending waits until the actual image is saved.')
    else if (message.includes('custody_unsupported')) this.view('unsupported', 'This connection cannot keep attachments across restart. Live attachments remain usable in this window.')
    else if (message.includes('custody_conflict')) this.view('conflict', changedElsewhere)
    else if (message.includes('custody_lifecycle')) this.view('pending-profile', 'The profile lifecycle changed. Saved bytes were kept; review the profile before continuing.')
    else this.view('error', 'Attachments were kept, but saving or restoring did not finish. Keep this window open and retry; remove excess attachments if the draft exceeds its limit.')
  }
  private restore(saved: DraftSnapshot) {
    const snapshot = this.validate(saved), merged = mergeCustodyIntent(this.base?.attachments ?? [], this.desired(), restoreCustodyPreviews(snapshot.attachments))
    this.base = snapshot
    this.$attachments.set(merged)
    if (snapshot.pendingSend) this.view('interrupted', 'A previous send was interrupted. Check the conversation before restoring these attachments. Restoring does not send anything.')
    else this.view('ready')
  }
  async start(initial: readonly ComposerAttachment[] = []): Promise<void> {
    if (this.started) return
    this.started = true
    this.$attachments.set([...initial])
    if (!this.api) { this.view('unsupported', 'This app cannot keep attachments across restart. Live attachments remain usable in this window.'); return }
    try {
      const opened = await this.api.open(this.address)
      if (opened.status === 'ready') { this.restore(opened.snapshot); void this.flush() }
      else {
        this.lease = draftLease(opened.lease)
        this.view(opened.status === 'retired' ? 'retired' : 'pending-profile', 'This profile is archived or has an unresolved archive. Saved bytes remain protected.')
      }
    } catch (error) { this.fail(error) }
  }
  update(attachments: readonly ComposerAttachment[]): void {
    if (this.$attachments.get() === attachments) return
    this.$attachments.set([...attachments])
    if (this.$view.get().phase === 'loading-image') this.view('ready')
    if (['ready', 'sending'].includes(this.$view.get().phase)) void this.flush()
  }
  async flush(): Promise<void> {
    if (this.writeInFlight) return this.writeInFlight
    if (!this.api || !this.base || !['ready', 'sending'].includes(this.$view.get().phase)) return
    const captured = this.desired(), current = this.base
    let payload
    try { payload = custodyPayload(this.address, captured) } catch (error) { this.fail(error); return }
    if (JSON.stringify(payload) === JSON.stringify(current.attachments)) return
    const sending = Boolean(this.reservation)
    if (!sending) this.view('saving', 'Saving attachments. Keep typing; press Send when saving finishes.')
    this.writeInFlight = this.api.write({ address: this.address, lease: current.lease, expectedRevision: current.revision, attachments: payload }).then(saved => {
      this.base = this.validate(saved)
      this.view(sending ? 'sending' : 'ready')
    }).catch(error => this.fail(error)).finally(() => { this.writeInFlight = null })
    await this.writeInFlight
    if (['ready', 'sending'].includes(this.$view.get().phase) && JSON.stringify(this.desired()) !== JSON.stringify(captured)) await this.flush()
  }
  canConsume(): boolean {
    const phase = this.$view.get().phase
    if (!this.$textReady.get() || !this.$queueReady.get() || this.writeInFlight || this.reservation || !['ready', 'unsupported'].includes(phase)) return false
    try { return !this.base || JSON.stringify(custodyPayload(this.address, this.desired())) === JSON.stringify(this.base.attachments) }
    catch (error) { this.fail(error); return false }
  }
  reserve(attachments: ComposerAttachment[], text: string, textQuote?: DraftTextQuote): CustodyReservation | null {
    if (!this.canConsume()) return null
    if (this.base && JSON.stringify(custodyPayload(this.address, attachments)) !== JSON.stringify(custodyPayload(this.address, this.$attachments.get()))) { this.view('conflict', changedElsewhere); return null }
    const ticket = this.base ? { address: this.address, lease: this.base.lease, revision: this.base.revision, id: crypto.randomUUID(), attachmentIds: attachments.map(custodyOccurrence), text } : undefined
    const reservation = { client: this, ticket, attachments: [...attachments], text, textQuote }
    this.reservation = reservation
    this.view('preparing', 'Checking the saved draft before sending.')
    return reservation
  }
  queueApi(): DraftQueueApi | undefined { return this.api?.queue }
  assign(reservation: CustodyReservation, session: string): void {
    if (!reservation.ticket || !this.api) return
    reservation.assignment = this.api.assignSend(reservation.ticket, session).catch(error => this.fail(error))
  }
  async stageQueue(address: DraftQueueAddress, entry: DraftQueueEntry, text: DraftTextQuote): Promise<DraftQueueEnvelope | null> {
    const source = this.base, api = this.queueApi()
    if (!source || !api || !matchesAddress({ owner: address.owner, session: source.address.session }, this.address) || !address.session) return null
    const reservation = this.reserve(this.$attachments.get(), entry.text)
    if (!reservation) return null
    let saved: DraftQueueEnvelope
    try {
      saved = await api.stage({ address, source, entry, sourceTextScope: text.scope, sourceTextRevision: text.revision })
    } catch (error) {
      this.reservation = undefined
      this.fail(error)
      return null
    }
    const transferred = new Set(entry.attachments.map(custodyOccurrence))
    this.$attachments.set(this.$attachments.get().filter(item => !transferred.has(custodyOccurrence(item))))
    this.reservation = undefined
    try {
      this.base = this.validate(await this.api!.read(this.address, source.lease))
      this.view('ready')
      await this.flush()
    } catch (error) { this.fail(error) }
    return saved // Native transfer acknowledgment must not be mistaken for a refused enqueue.
  }
  async begin(reservation: CustodyReservation): Promise<boolean> {
    if (this.reservation !== reservation) return false
    try {
      if (reservation.ticket) await this.api!.beginSend(reservation.ticket)
      const ids = new Set(reservation.attachments.map(custodyOccurrence))
      this.$attachments.set(this.$attachments.get().filter(item => !ids.has(custodyOccurrence(item))))
      this.view('sending')
      return true
    } catch (error) {
      this.$attachments.set(mergeCustodyIntent([], reservation.attachments, this.$attachments.get()))
      this.$restoredText.set(reservation.text)
      this.reservation = undefined
      this.fail(error)
      return false
    }
  }
  private showSendOutcome(outcome: 'accepted' | 'rejected' | 'unknown'): boolean {
    if (outcome === 'unknown') this.view('interrupted', 'The send outcome is unknown. Check the conversation before restoring attachments. Nothing will be sent automatically.')
    else if (this.base?.pendingSend?.handoff) this.view('interrupted', 'Your message was accepted. Later unsent attachments are saved separately for this conversation; restore them without sending.')
    else if (outcome === 'rejected' && this.base?.pendingSend) this.view('interrupted', 'This message was not accepted. The original text and attachments are saved. Restore them without sending when the current draft is empty.')
    else { this.view(this.api && this.base ? 'ready' : 'unsupported'); return true }
    return false
  }
  async finish(reservation: CustodyReservation, outcome: 'accepted' | 'rejected' | 'unknown'): Promise<void> {
    if (this.reservation !== reservation) return
    try {
      if (reservation.ticket) this.base = this.validate(await this.api!.finishSend(reservation.ticket, outcome))
      this.reservation = undefined
      if (outcome !== 'accepted') {
        this.$attachments.set(mergeCustodyIntent([], reservation.attachments, this.$attachments.get()))
      }
      if (this.showSendOutcome(outcome)) await this.flush()
    } catch (error) {
      this.reservation = undefined
      this.$attachments.set(mergeCustodyIntent([], reservation.attachments, this.$attachments.get()))
      this.fail(error)
    }
  }
  private async restoreEarlierDraft(recovery: DraftCustodyClient, allowTextRestore: boolean): Promise<void> {
      if (!allowTextRestore) { this.$recoveryError.set('Your current message was kept. Keep or clear it before restoring the earlier saved draft.'); return }
      if (await recovery.moveTo(this, true)) {
        this.$recoverySource.set(null)
        this.$recoveryError.set('')
        await this.retry(true)
      }
  }
  private async restoreInterrupted(snapshot: DraftSnapshot, allowTextRestore: boolean): Promise<DraftSnapshot | null> {
    const pending = snapshot.pendingSend!
    if (!allowTextRestore) { this.view('interrupted', 'The recovered message is still saved. Keep or clear your current text before restoring it; nothing was overwritten or sent.'); return null }
    const interrupted = snapshot.attachments.filter(item => pending.attachmentIds.includes(custodyOccurrence(item)))
    this.$attachments.set(mergeCustodyIntent([], interrupted, this.$attachments.get()))
    const saved = await this.api!.finishSend({ address: this.address, lease: this.lease!, revision: snapshot.revision, id: pending.id, attachmentIds: pending.attachmentIds, text: pending.text }, 'restore')
    this.$restoredText.set(pending.text)
    this.reservation = undefined
    return saved
  }
  private readRetrySnapshot(allowTextRestore: boolean): Promise<DraftSnapshot | null> {
    const phase = this.$view.get().phase
    if (phase === 'interrupted' && this.base?.pendingSend) return this.restoreInterrupted(this.base, allowTextRestore)
    return phase === 'pending-profile' ? this.api!.recover(this.address, this.lease!) : this.api!.read(this.address, this.lease!)
  }
  async retry(allowTextRestore = true, restoreEarlier = true): Promise<void> {
    if (!this.api) return
    const recovery = this.$recoverySource.get()
    if (recovery && restoreEarlier) {
      await this.restoreEarlierDraft(recovery, allowTextRestore)
      return
    }
    if (!this.lease) { this.started = false; await this.start(this.$attachments.get()); return }
    try {
      const saved = await this.readRetrySnapshot(allowTextRestore)
      if (!saved) return
      this.restore(saved)
      if (this.$view.get().phase === 'ready') await this.flush()
    } catch (error) { this.fail(error) }
  }
  snapshot(): DraftSnapshot | undefined { return this.base }
  queueFailure(error: unknown): void { this.fail(error) }
  async hydrateCaptured(lease: DraftLease): Promise<void> {
    if (!this.api || this.reservation || this.writeInFlight || (this.lease && this.lease.generation !== lease.generation)) return
    this.started = true
    this.lease ??= draftLease(lease)
    try { this.restore(await this.api.read(this.address, this.lease)) }
    catch (error) { this.fail(error) }
  }
  async moveTo(target: DraftCustodyClient, restoreInterrupted = false): Promise<boolean> {
    if (!this.api || !this.base || !target.base || this.reservation || target.reservation || this.writeInFlight || target.writeInFlight) return false
    try {
      const captured = this.base, moved = await this.api.move({ from: captured, to: target.base, restoreInterrupted })
      const transferred = new Set(captured.attachments.map(custodyOccurrence))
      this.$attachments.set(this.$attachments.get().filter(item => !transferred.has(custodyOccurrence(item))))
      this.base = this.validate(await this.api.read(this.address, captured.lease))
      target.restore(moved)
      this.view('ready')
      return true
    } catch { target.$recoveryError.set('The earlier draft was kept separately. Your current saved draft was not replaced; finish or remove its attachments before restoring the earlier draft.'); return false }
  }
  async refresh(): Promise<void> {
    if (!this.api || !this.lease || !['ready', 'sending'].includes(this.$view.get().phase)) return
    await this.writeInFlight
    try { this.restore(await this.api.read(this.address, this.lease)) }
    catch (error) { this.fail(error) }
  }
  hasSubmission(): boolean { return Boolean(this.reservation || this.base?.pendingSend) }
}
