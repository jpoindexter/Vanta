import { randomUUID } from 'node:crypto'
import { draftOwnerState, draftSnapshot } from '../../../shared/src/vanta/draft-custody-protocol'
import { draftQueueEnvelope } from '../../../shared/src/vanta/draft-queue-custody'
import { custodyDigest, type createCustodyFiles } from './draft-custody-files'
import { draftQueueStorageKey } from './draft-queue-custody'

type Files = ReturnType<typeof createCustodyFiles>
/** Read-only readiness: never recover, consume, remove, or rewrite a custody checkpoint. */
export class CustodyUpdateLease {
  private lease: string | undefined
  get blocked(): boolean { return this.lease !== undefined }

  async prepare(options: { drain: Promise<unknown>; files: Files; busy: () => boolean }): Promise<string> {
    if (this.lease) throw new Error('A custody update is already being prepared.')
    const lease = randomUUID()
    this.lease = lease
    try {
      await options.drain
      if (options.busy()) throw new Error('An attachment submission or archive is still running.')
      for (const name of await options.files.entries()) await requireReadyFile(options.files, name)
      return lease
    } catch (error) { if (this.lease === lease) this.lease = undefined; throw error }
  }

  async cancel(lease: string): Promise<void> {
    if (!this.lease || this.lease !== lease) throw new Error('The custody update lease does not match.')
    this.lease = undefined
  }
}

async function requireReadyFile(files: Files, name: string): Promise<void> {
  if (/^[a-f0-9]{64}\.send\.json$/.test(name)) throw new Error('An attachment submission needs review before update.')
  if (/^[a-f0-9]{64}\.owner\.json$/.test(name)) {
    const owner = draftOwnerState(await files.read(name))
    if (name !== `${custodyDigest(owner.owner)}.owner.json`) throw new Error('Saved custody owner identity is unknown.')
    if (owner.status === 'pending') throw new Error('An archive result needs review before update.')
  }
  if (/^[a-f0-9]{64}\.draft\.json$/.test(name)) {
    const draft = draftSnapshot(await files.read(name))
    if (name !== `${custodyDigest(draft.address)}.draft.json`) throw new Error('Saved draft identity is unknown.')
  }
  if (/^[a-f0-9]{64}\.queue\.json$/.test(name)) {
    const queue = draftQueueEnvelope(await files.read(name))
    if (name !== draftQueueStorageKey(queue.address)) throw new Error('Saved queue identity is unknown.')
    if (!['accepted', 'removed'].includes(queue.status)) throw new Error('An attachment queue checkpoint needs attention before update.')
  }
}
