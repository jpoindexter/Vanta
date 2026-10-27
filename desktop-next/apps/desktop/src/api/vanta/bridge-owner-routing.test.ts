import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VantaTransport } from '@vanta/shared/vanta'
import { bridgeTransport } from './bridge-transport'
import { createVantaBridge } from '../../../electron/vanta/bridge-vanta'
import { createRequestBridge } from '../../../electron/vanta/request-bridge'
import { CH } from '../../../electron/vanta/channels'

function fixture() {
  const request = vi.fn<VantaTransport['request']>(async () => ({ ok: true, status: 200, data: {} }))
  const openEvents = vi.fn<VantaTransport['openEvents']>(() => () => {})
  const transport: VantaTransport = { request, openEvents }
  const main = createRequestBridge(transport, { frame: CH.eventsFrame, closed: CH.eventsClosed })
  const sink = { id: 1, isDestroyed: () => false, send: () => {} }
  const ipc = {
    invoke: async <T>(_channel: string, call: unknown) => main.request(structuredClone(call)) as T,
    on: vi.fn(), removeListener: vi.fn(),
    send: (_channel: string, ...args: unknown[]) => {
      main.openStream(sink, structuredClone({ streamId: args[0], clientId: args[1], owner: args[2] }))
    }
  }
  const bridge = createVantaBridge(ipc)
  vi.stubGlobal('window', { desktopBridge: { vanta: bridge } })
  return { request, openEvents, main, sink }
}

afterEach(() => vi.unstubAllGlobals())

describe('gateway ownership survives renderer, preload and main', () => {
  it('pins requests and events independently even when profiles reuse a client ID', async () => {
    const { request, openEvents } = fixture()
    const a = bridgeTransport(), b = bridgeTransport()
    a.bindOwner('vanta://local?profile=default')
    b.bindOwner('vanta://local?profile=writer')
    await a.request({ method: 'POST', path: '/api/chat', clientId: 'same-client', body: { message: 'a' } })
    await b.request({ method: 'POST', path: '/api/chat', clientId: 'same-client', body: { message: 'b' } })
    a.openEvents('same-client', { onClose: () => {}, onFrame: () => {} })
    b.openEvents('same-client', { onClose: () => {}, onFrame: () => {} })
    expect(request.mock.calls.map(([call]) => call)).toMatchObject([
      { connectionId: 'local', profile: 'default', body: { message: 'a' } },
      { connectionId: 'local', profile: 'writer', body: { message: 'b' } }
    ])
    expect(openEvents.mock.calls.map(call => call[2])).toEqual([
      { connectionId: 'local', profile: 'default' }, { connectionId: 'local', profile: 'writer' }
    ])
  })

  it('refuses malformed or foreign URLs and owner changes without a request', async () => {
    const { request, openEvents } = fixture()
    const transport = bridgeTransport()
    for (const url of ['https://example.test', 'vanta://other?profile=writer', 'vanta://local?profile=',
      'vanta://local?profile=a&profile=b', 'vanta://local/path', 'vanta://local#writer']) {
      expect(() => transport.bindOwner(url)).toThrow()
    }
    transport.bindOwner('vanta://local?profile=writer')
    transport.bindOwner('vanta://local?profile=writer')
    expect(() => transport.bindOwner('vanta://local?profile=default')).toThrow('cannot change')
    await expect(transport.request({ method: 'POST', path: '/api/chat', profile: 'default' })).rejects.toThrow('does not match')
    expect(request).not.toHaveBeenCalled()
    expect(openEvents).not.toHaveBeenCalled()
  })

  it('refuses malformed native stream ownership instead of dropping it to primary', () => {
    const { main, sink, openEvents } = fixture()
    for (const owner of ['writer', { profile: {} }, { connectionId: '' }]) {
      expect(main.openStream(sink, { streamId: 's', clientId: 'c', owner }).ok).toBe(false)
    }
    expect(openEvents).not.toHaveBeenCalled()
  })
})
