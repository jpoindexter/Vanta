import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FakeVantaTransport } from './vanta/fake-transport'

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  delete (window as { hermesDesktop?: unknown }).hermesDesktop
})

describe('HermesGateway picks its transport from the shell', () => {
  it('is the WebSocket client when the preload has no Vanta bridge', async () => {
    const { JsonRpcGatewayClient } = await import('@hermes/shared')
    const { HermesGateway } = await import('./gateway-class')
    const { VantaGateway } = await import('./vanta-gateway')
    const gateway = new HermesGateway()

    expect(gateway).toBeInstanceOf(JsonRpcGatewayClient)
    expect(gateway).not.toBeInstanceOf(VantaGateway)
  })

  it('is the Vanta HTTP/SSE gateway, over the bridge, when the preload exposes hermesDesktop.vanta', async () => {
    const transport = new FakeVantaTransport().ok('GET /api/approval', null)
    ;(window as { hermesDesktop?: unknown }).hermesDesktop = { vanta: transport }
    const { JsonRpcGatewayClient } = await import('@hermes/shared')
    const { HermesGateway } = await import('./gateway-class')
    const { VantaGateway } = await import('./vanta-gateway')
    const gateway = new HermesGateway()

    expect(gateway).toBeInstanceOf(VantaGateway)
    expect(gateway).toBeInstanceOf(JsonRpcGatewayClient)
    await expect(gateway.request('session.list')).rejects.toThrow('Hermes gateway is not connected')

    await gateway.connect('vanta://local')

    expect(gateway.connectionState).toBe('open')
    expect(transport.callsTo('GET /api/approval')).toHaveLength(1)
  })
})
