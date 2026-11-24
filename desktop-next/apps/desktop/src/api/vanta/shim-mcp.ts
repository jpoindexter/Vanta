import { z } from 'zod'

import type { McpCatalogEntry, McpCatalogResponse, McpServerSummary, McpServerTestResponse } from '@/types/desktop'

import { get, post, segment, type Send, type ShimRoute } from './shim-core'

const MCP_PATH = '/api/connect/mcp'
const PROBE_TIMEOUT_MS = 60_000

const connectorSchema = z.looseObject({
  enabled: z.boolean(),
  name: z.string(),
  tools: z.array(z.string()),
  transport: z.string(),
  trust: z.enum(['trusted', 'denied', 'pending'])
})

const catalogSchema = z.looseObject({
  args: z.array(z.string()).optional(),
  authEnv: z.array(z.string()).optional(),
  command: z.string().optional(),
  defaultTools: z.array(z.string()),
  description: z.string(),
  docsUrl: z.string().optional(),
  installed: z.boolean(),
  name: z.string(),
  tokenEnv: z.string().optional(),
  url: z.string().optional()
})

const payloadSchema = z.looseObject({
  catalog: z.array(catalogSchema),
  connectors: z.array(connectorSchema)
})

const probeSchema = z.looseObject({
  error: z.string().optional(),
  result: z.looseObject({ error: z.string().optional(), status: z.string(), tools: z.array(z.string()) }).optional()
})

type Connector = z.infer<typeof connectorSchema>

const readPayload = async (send: Send) => payloadSchema.parse(await get(send, MCP_PATH))

const act = (send: Send, action: string, name: string, timeoutMs?: number) => post(send, MCP_PATH, { action, name }, timeoutMs)

// A Vanta connector only runs once it is both enabled and trusted for the project; the Vanta toggle is one switch.
const toServer = (connector: Connector): McpServerSummary => ({
  args: [],
  command: null,
  enabled: connector.enabled && connector.trust === 'trusted',
  name: connector.name,
  tools: connector.tools.length ? connector.tools : null,
  transport: connector.transport,
  url: null
})

function toCatalogEntry(entry: z.infer<typeof catalogSchema>, connectors: readonly Connector[]): McpCatalogEntry {
  const env = [...(entry.authEnv ?? []), ...(entry.tokenEnv ? [entry.tokenEnv] : [])]
  const connector = connectors.find(item => item.name === entry.name)

  return {
    args: entry.args ?? [],
    auth_type: env.length ? 'env' : 'none',
    bootstrap: [],
    command: entry.command ?? null,
    connector_slug: null,
    default_enabled: entry.defaultTools,
    description: entry.description,
    enabled: Boolean(connector?.enabled && connector.trust === 'trusted'),
    install_ref: null,
    install_url: entry.docsUrl ?? null,
    installed: entry.installed,
    name: entry.name,
    needs_install: false,
    post_install: '',
    required_env: env.map(name => ({ name, prompt: name, required: true })),
    source: 'vanta',
    transport: entry.url ? 'http' : 'stdio',
    url: entry.url ?? null
  }
}

async function runTest(send: Send, name: string): Promise<McpServerTestResponse> {
  try {
    const result = probeSchema.parse(await act(send, 'test', name, PROBE_TIMEOUT_MS)).result

    return {
      error: result?.status === 'connected' ? undefined : (result?.error ?? 'The server did not connect.'),
      ok: result?.status === 'connected',
      tools: (result?.tools ?? []).map(tool => ({ description: '', name: tool }))
    }
  } catch (error) {
    // A failed probe is an answer (it comes back as an error status), not a broken page.
    return { error: error instanceof Error ? error.message : String(error), ok: false, tools: [] }
  }
}

/** The Vanta MCP server calls, answered from the Vanta connector registry and its trust model. */
export const mcpRoutes: readonly ShimRoute[] = [
  {
    handle: async ({ send }) => ({ servers: (await readPayload(send)).connectors.map(toServer) }),
    method: 'GET',
    path: /^\/api\/mcp\/servers$/
  },
  {
    handle: async ({ send }): Promise<McpCatalogResponse> => {
      const { catalog, connectors } = await readPayload(send)

      return { diagnostics: [], entries: catalog.map(entry => toCatalogEntry(entry, connectors)) }
    },
    method: 'GET',
    path: /^\/api\/mcp\/catalog$/
  },
  {
    handle: async ({ body, send }) => {
      const name = z.string().parse(body.name)

      await post(send, MCP_PATH, { action: 'install', env: body.env, name })

      if (body.enable !== false) {
        await act(send, 'trust', name)
        await act(send, 'enable', name)
      }

      return { name, ok: true }
    },
    method: 'POST',
    path: /^\/api\/mcp\/catalog\/install$/
  },
  {
    // A custom server starts untrusted and off: turning it on later is the owner's explicit grant.
    handle: async ({ body, send }): Promise<McpServerSummary> => {
      const name = z.string().parse(body.name)

      await post(send, MCP_PATH, { action: 'add', args: body.args, command: body.command, env: body.env, name, url: body.url })

      const added = (await readPayload(send)).connectors.find(connector => connector.name === name)

      if (!added) {
        throw new Error(`${name} was not found after adding it`)
      }

      return toServer(added)
    },
    method: 'POST',
    path: /^\/api\/mcp\/servers$/
  },
  {
    handle: async call => {
      const name = segment(call)

      if (call.body.enabled === true) {
        await act(call.send, 'trust', name)
        await act(call.send, 'enable', name)
      } else {
        await act(call.send, 'disable', name)
      }

      return { ok: true }
    },
    method: 'PUT',
    path: /^\/api\/mcp\/servers\/([^/]+)\/enabled$/
  },
  {
    handle: async call => runTest(call.send, segment(call)),
    method: 'POST',
    path: /^\/api\/mcp\/servers\/([^/]+)\/test$/
  },
  {
    handle: async call => {
      await act(call.send, 'remove', segment(call))

      return { ok: true }
    },
    method: 'DELETE',
    path: /^\/api\/mcp\/servers\/([^/]+)$/
  }
]
