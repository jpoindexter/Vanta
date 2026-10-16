import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FakeVantaTransport } from './vanta/fake-transport'

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  delete (window as { desktopBridge?: unknown }).desktopBridge
})

describe('VantaGateway picks its transport from the shell', () => {
  it('is the WebSocket client when the preload has no Vanta bridge', async () => {
    const { JsonRpcGatewayClient } = await import('@vanta/shared')
    const { VantaGateway } = await import('./gateway-class')
    const { VantaGateway: VantaHttpGateway } = await import('./vanta-gateway')
    const gateway = new VantaGateway()

    expect(gateway).toBeInstanceOf(JsonRpcGatewayClient)
    expect(gateway).not.toBeInstanceOf(VantaHttpGateway)
  })

  it('is the Vanta HTTP/SSE gateway, over the bridge, when the preload exposes desktopBridge.vanta', async () => {
    const transport = new FakeVantaTransport().ok('GET /api/approval', null)
    ;(window as { desktopBridge?: unknown }).desktopBridge = { vanta: transport }
    const { JsonRpcGatewayClient } = await import('@vanta/shared')
    const { VantaGateway } = await import('./gateway-class')
    const { VantaGateway: VantaHttpGateway } = await import('./vanta-gateway')
    const gateway = new VantaGateway()

    expect(gateway).toBeInstanceOf(VantaHttpGateway)
    expect(gateway).toBeInstanceOf(JsonRpcGatewayClient)
    await expect(gateway.request('session.list')).rejects.toThrow('Vanta gateway is not connected')

    await gateway.connect('vanta://local')

    expect(gateway.connectionState).toBe('open')
    expect(transport.callsTo('GET /api/approval')).toHaveLength(1)
  })
})
