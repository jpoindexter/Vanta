import type { DraftAddress } from '../../../shared/src/vanta/draft-custody'
import type { DraftLease } from '../../../shared/src/vanta/draft-custody-protocol'
import { draftQueueEnvelope, type DraftQueueAccepted, type DraftQueueApi, type DraftQueueEnvelope, type DraftQueueQuote, type DraftQueueStage, type DraftQueueEntry } from '../../../shared/src/vanta/draft-queue-custody'

export interface QueueDispatchCallbacks {
  onAccepted(identity: { runtimeSessionId: string; storedSessionId: string | null }): void
  onDispatchStarted(): Promise<void> | void
}
export interface QueueDispatchResult { status: 'accepted' | 'rejected' | 'unknown'; envelope: DraftQueueEnvelope }
const quote = (value: DraftQueueEnvelope): DraftQueueQuote => ({ address: value.address, lease: value.lease, revision: value.revision })
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

/** Native is authoritative; the existing queue store remains its UI projection. */
export class DraftQueueCustodyClient {
  constructor(private readonly api: DraftQueueApi, private readonly project: (value: DraftQueueEnvelope, restored?: boolean) => void) {}
  private publish(value: DraftQueueEnvelope, expected: Pick<DraftQueueEnvelope, 'address' | 'lease'>, restored = false): DraftQueueEnvelope {
    const saved = draftQueueEnvelope(value)
    if (!same(saved.address, expected.address) || !same(saved.lease, expected.lease)) throw new Error('Queued attachment owner changed; nothing was sent.')
    if (restored) this.project(saved, true)
    else this.project(saved)
    return saved
  }
  async stage(request: DraftQueueStage): Promise<DraftQueueEnvelope> {
    return this.publish(await this.api.stage(request), { address: request.address, lease: request.source.lease })
  }
  async restore(address: DraftAddress, lease: DraftLease): Promise<DraftQueueEnvelope[]> {
    const restored = await this.api.list(address, lease)
    return restored.map(value => {
      if (value.address.session !== address.session) throw new Error('Queued attachment conversation changed; saved bytes retained.')
      return this.publish(value, { address: { ...address, entryId: value.address.entryId }, lease }, true)
    })
  }
  async update(current: DraftQueueEnvelope, entry: DraftQueueEntry): Promise<DraftQueueEnvelope> {
    return this.publish(await this.api.update({ ...quote(current), entry }), current)
  }
  async remove(current: DraftQueueEnvelope): Promise<DraftQueueEnvelope> {
    return this.publish(await this.api.remove(quote(current)), current)
  }
  async dispatch(current: DraftQueueEnvelope, submit: (callbacks: QueueDispatchCallbacks) => Promise<boolean | void>): Promise<QueueDispatchResult> {
    const attemptId = crypto.randomUUID()
    const started = this.publish(await this.api.begin({ ...quote(current), attemptId }), current)
    let accepted: DraftQueueAccepted | undefined, invoked = false
    const callbacks: QueueDispatchCallbacks = {
      onAccepted: identity => { accepted = identity },
      onDispatchStarted: () => {
        if (invoked) throw new Error('Queued attachment dispatch already started; automatic replay is blocked until its result is reviewed.')
        invoked = true
      }
    }
    try { await submit(callbacks) } catch { /* The acknowledgment latch, not a thrown cleanup, decides delivery. */ }
    const outcome = accepted ? 'accepted' : invoked ? 'unknown' : 'rejected'
    // A native finish failure must reject: never remove a projection before its durable acknowledgment.
    const saved = this.publish(await this.api.finish({ ...quote(started), attemptId, outcome, ...(accepted ? { accepted } : {}) }), current)
    return { status: outcome, envelope: saved }
  }
}
