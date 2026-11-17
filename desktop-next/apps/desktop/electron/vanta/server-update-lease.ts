import type { VantaTransport } from '../../../shared/src/vanta'

/** Holds the exact live server transport: update preparation never launches or follows a replacement. */
export class ServerUpdateLease {
  private current: { transport: VantaTransport; lease: string } | undefined
  blocked = false

  async prepare(capture: () => { transport: VantaTransport; validate: () => void }): Promise<string> {
    if (this.blocked) throw new Error('A runtime update is already being prepared.')
    this.blocked = true
    try {
      const { transport, validate } = capture()
      const response = await transport.request({ method: 'POST', path: '/api/desktop/update/prepare', body: {} })
      const data = response.data as { ok?: unknown; lease?: unknown; error?: unknown } | undefined
      if (!response.ok || response.status !== 200 || data?.ok !== true || typeof data.lease !== 'string' || !/^[a-f0-9-]{36}$/.test(data.lease)) throw new Error(typeof data?.error === 'string' ? data.error : 'Runtime update readiness could not be established.')
      this.current = { transport, lease: data.lease }
      validate()
      return data.lease
    } catch (error) {
      if (this.current) await this.cancel(this.current.lease)
      else this.blocked = false
      throw error
    }
  }

  async cancel(lease: string): Promise<void> {
    const current = this.current
    if (!current || current.lease !== lease) throw new Error('The runtime update lease does not match.')
    const response = await current.transport.request({ method: 'POST', path: '/api/desktop/update/cancel', body: { lease } })
    if (!response.ok || response.status !== 200 || (response.data as { ok?: unknown } | undefined)?.ok !== true) throw Object.assign(new Error('Could not release the runtime update lease; new work remains blocked.'), { keepPrepared: true as const })
    this.current = undefined
    this.blocked = false
  }
}
