import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { addMcpServer, getMcpCatalog, installMcpCatalogEntry, listMcpServers, removeMcpServer, setMcpServerEnabled, testMcpServer } from '@/api/mcp'
import type { VantaApiRequest } from '@/global'
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

    installRestBridge((request: VantaApiRequest) => {
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
    delete (window as { desktopBridge?: unknown }).desktopBridge
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

  it('sends the API key typed in the install form with the install', async () => {
    await installMcpCatalogEntry('github', { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_x' })

    expect(actions[0]).toEqual({ action: 'install', env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_x' }, name: 'github' })
  })

  it('adds a custom server without trusting or enabling it, and returns it as off', async () => {
    const added = await addMcpServer({ args: ['-y', 'x'], command: 'npx', env: { K: 'v' }, name: 'filesystem' })

    expect(actions.map(a => a.action)).toEqual(['add'])
    expect(actions[0]).toMatchObject({ args: ['-y', 'x'], command: 'npx', env: { K: 'v' }, name: 'filesystem' })
    expect(added).toMatchObject({ name: 'filesystem', transport: 'http' })
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
