import { randomUUID } from 'node:crypto'

interface UpdateRuntime { prepareUpdate(): Promise<string>; cancelUpdate(lease: string): Promise<void> }
/** Native admission reservation covers profile lookup/creation before a backend can see the request. */
export class ProfileUpdateLeases {
  private admissions = 0
  private current: { lease: string; runtimes: Array<{ host: UpdateRuntime; lease: string }> } | undefined

  admit(): () => void {
    if (this.current) throw new Error('A desktop update is prepared. Cancel it before starting new work.')
    this.admissions++
    let released = false
    return () => { if (!released) { released = true; this.admissions-- } }
  }

  async prepare(hosts: Array<UpdateRuntime | Promise<UpdateRuntime>>, validate: () => void): Promise<string> {
    if (this.current) throw new Error('A desktop update is already being prepared.')
    if (this.admissions) throw new Error('Finish native work before preparing a desktop update.')
    const current = { lease: randomUUID(), runtimes: [] as Array<{ host: UpdateRuntime; lease: string }> }
    this.current = current
    try {
      for (const pending of hosts) {
        const host = await pending
        validate()
        current.runtimes.push({ host, lease: await host.prepareUpdate() })
        validate()
      }
      return current.lease
    } catch (error) {
      await this.cancel(current.lease)
      throw error
    }
  }

  async cancel(lease: string): Promise<void> {
    const current = this.current
    if (!current || lease !== current.lease) throw new Error('The desktop update lease does not match.')
    const failures: unknown[] = []
    for (const item of [...current.runtimes].reverse()) {
      try { await item.host.cancelUpdate(item.lease); current.runtimes.splice(current.runtimes.indexOf(item), 1) }
      catch (error) { failures.push(error) }
    }
    if (failures.length) throw Object.assign(new Error('Some runtime update leases could not be released; new work remains blocked.', { cause: failures[0] }), { keepPrepared: true as const })
    this.current = undefined
  }
}
