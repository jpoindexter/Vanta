import { describe, expect, it } from 'vitest'

import { connectorsAccounts, connectorsList, connectorsPolicyGet, mcpServersList, mcpServersStatus } from './handlers-connectors'
import type { GatewayHub } from './hub'

const CONNECTORS = [
  { enabled: true, health: 'ready', name: 'filesystem', tools: ['read', 'list'], transport: 'stdio', trust: 'trusted' },
  { enabled: true, health: 'ready', name: 'untrusted', tools: [], transport: 'http', trust: 'pending' },
  { enabled: false, health: 'error', name: 'off', tools: [], transport: 'stdio', trust: 'trusted' }
]

const hub = (result: { data?: unknown; ok: boolean; status: number }) =>
  ({ caller: { get: async () => result } }) as unknown as GatewayHub

const served = hub({ data: { catalog: [], connectors: CONNECTORS, receipts: [] }, ok: true, status: 200 })

describe('the Connectors page gets answers instead of unsupported results', () => {
  it('has no hosted accounts and no policy layers, so nothing is locked by an organization', async () => {
    await expect(connectorsList(served, {})).resolves.toEqual({ available: false, connectors: [] })
    await expect(connectorsAccounts(served, {})).resolves.toEqual({ accounts: [] })
    await expect(connectorsPolicyGet(served, {})).resolves.toMatchObject({ effective: { mode: 'unrestricted' }, layers: [] })
  })

  it('lists MCP servers, on only when enabled and trusted', async () => {
    const { servers } = (await mcpServersList(served, {})) as { servers: { enabled: boolean; name: string; tools: unknown }[] }

    expect(servers.map(s => [s.name, s.enabled, s.tools])).toEqual([['filesystem', true, ['read', 'list']], ['untrusted', false, null], ['off', false, null]])
  })

  it('reports runtime status per server from the registry health', async () => {
    const { servers } = (await mcpServersStatus(served, {})) as { servers: { connected: boolean; name: string; status: string; tools: number }[] }

    expect(servers.map(s => [s.name, s.status, s.connected, s.tools])).toEqual([['filesystem', 'connected', true, 2], ['untrusted', 'disabled', false, 0], ['off', 'disabled', false, 0]])
  })

  it('says so when the Vanta server cannot be reached instead of inventing an empty list', async () => {
    await expect(mcpServersList(hub({ ok: false, status: 0 }), {})).rejects.toThrow(/could not reach/)
  })
})
