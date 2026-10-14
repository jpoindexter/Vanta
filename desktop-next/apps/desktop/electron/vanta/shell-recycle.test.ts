import { describe, expect, it, vi } from 'vitest'

import { CH } from './channels'
import { registerShellHandlers, type ShellDeps } from './shell-handlers'

function register(restart: () => Promise<void>) {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()

  const ipc = {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => void handlers.set(channel, fn),
    on: vi.fn()
  }

  registerShellHandlers({ ipc, log: { file: '/tmp/x.log', recent: () => [] }, restart } as unknown as ShellDeps)

  return handlers
}

describe('the crash toast\'s "Restart Vanta"', () => {
  it('restarts the runtime and says so', async () => {
    const restart = vi.fn(async () => undefined)
    const handler = register(restart).get(CH.backendRecycle)!

    await expect(handler({})).resolves.toEqual({ ok: true })
    expect(restart).toHaveBeenCalledTimes(1)
  })

  it('tells the renderer when the runtime could not be started, instead of claiming success', async () => {
    const handler = register(async () => {
      throw new Error('The Vanta runtime exited before it was listening (code 1).')
    }).get(CH.backendRecycle)!

    await expect(handler({})).rejects.toThrow('exited before it was listening')
  })
})
