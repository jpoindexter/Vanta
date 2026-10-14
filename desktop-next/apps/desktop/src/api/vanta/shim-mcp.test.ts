import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getMcpCatalog, installMcpCatalogEntry, listMcpServers, removeMcpServer, setMcpServerEnabled, testMcpServer } from '@/api/mcp'
import type { HermesApiRequest } from '@/global'
import { installRestBridge } from '@/test/rest-bridge'

const PAYLOAD = {
  catalog: [
    { authEnv: ['GITHUB_TOKEN'], command: 'npx', args: ['-y', 'gh'], defaultTools: ['search'], description: 'GitHub', installed: false, name: 'github' },
    { defaultTools: ['read'], description: 'Files', installed: true, name: 'filesystem', url: 'https://fs.example/mcp' }
  ],
  connectors: [
    { enabled: true, name: 'filesystem', tools: ['read'], transport: 'http', trust: 'trusted' },
    { enabled: true, name: 'pending-one', tools: [], transport: 'stdio', trust: 'pending' }
  ],
  receipts: []
}

describe('Connectors reads and controls MCP servers through the Vanta connector routes', () => {
  let actions: Record<string, unknown>[]
  let probe: Error | object

  beforeEach(() => {
    actions = []
    probe = { result: { status: 'connected', tools: ['read'] } }

    installRestBridge((request: HermesApiRequest) => {
      if (request.path === '/api/connect/mcp' && !request.method) {
        return PAYLOAD
      }

      if (request.path === '/api/connect/mcp') {
        const body = request.body as Record<string, unknown>
        actions.push(body)

        if (body.action === 'test' && probe instanceof Error) {
          throw probe
        }

        return body.action === 'test' ? probe : PAYLOAD
      }

      return {}
    })
    ;(window as { vantaDesktop?: unknown }).vantaDesktop = {}
  })

  afterEach(() => {
    delete (window as { hermesDesktop?: unknown }).hermesDesktop
    delete (window as { vantaDesktop?: unknown }).vantaDesktop
  })

  it('shows a server as enabled only when it is trusted as well', async () => {
    const { servers } = await listMcpServers()

    expect(servers.map(s => [s.name, s.enabled, s.tools])).toEqual([['filesystem', true, ['read']], ['pending-one', false, null]])
  })

  it('maps the catalog with its required settings and what is installed', async () => {
    const { entries } = await getMcpCatalog()

    expect(entries[0]).toMatchObject({ auth_type: 'env', installed: false, name: 'github', required_env: [{ name: 'GITHUB_TOKEN', required: true }], transport: 'stdio' })
    expect(entries[1]).toMatchObject({ auth_type: 'none', enabled: true, installed: true, transport: 'http', url: 'https://fs.example/mcp' })
  })

  it('turning a server on trusts then enables it; turning it off only disables', async () => {
    await setMcpServerEnabled('pending-one', true)
    await setMcpServerEnabled('pending-one', false)

    expect(actions.map(a => a.action)).toEqual(['trust', 'enable', 'disable'])
  })

  it('installs from the catalog, then trusts and enables it', async () => {
    await installMcpCatalogEntry('github')

    expect(actions.map(a => a.action)).toEqual(['install', 'trust', 'enable'])
  })

  it('removes a server by name', async () => {
    await removeMcpServer('pending-one')

    expect(actions).toEqual([{ action: 'remove', name: 'pending-one' }])
  })

  it('reports a successful probe with its tools and a failed one as a result, not a crash', async () => {
    await expect(testMcpServer('filesystem')).resolves.toMatchObject({ ok: true, tools: [{ name: 'read' }] })

    probe = new Error('authentication required')
    await expect(testMcpServer('filesystem')).resolves.toMatchObject({ error: 'authentication required', ok: false, tools: [] })
  })
})
