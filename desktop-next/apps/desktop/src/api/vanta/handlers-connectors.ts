import { z } from 'zod'

import type { Handler } from './handlers-session'
import { expectOk, parseBody } from './rpc'

const MCP_PATH = '/api/connect/mcp'

const connectorSchema = z.looseObject({
  enabled: z.boolean(),
  health: z.string(),
  name: z.string(),
  tools: z.array(z.string()),
  transport: z.string(),
  trust: z.string()
})

const mcpSchema = z.looseObject({ connectors: z.array(connectorSchema) })

type Connector = z.infer<typeof connectorSchema>

const readConnectors = async (hub: Parameters<Handler>[0]): Promise<Connector[]> =>
  parseBody(mcpSchema, expectOk(await hub.caller.get(undefined, MCP_PATH), 'mcp connectors'), 'mcp connectors').connectors

// A Vanta connector runs only once it is enabled and trusted for the project.
const isOn = (connector: Connector): boolean => connector.enabled && connector.trust === 'trusted'

// Hosted connector accounts are a Vanta service Vanta does not have: no catalog, no accounts, no policy layers.
// An empty answer (not "unsupported") lets the Connectors page render its own MCP side.
export const connectorsList: Handler = async () => ({ available: false, connectors: [] })

export const connectorsCatalog: Handler = async () => ({ connectors: [] })

export const connectorsAccounts: Handler = async () => ({ accounts: [] })

export const connectorsPolicyGet: Handler = async () => ({
  effective: { issued_at_ms: Date.now(), mode: 'unrestricted', revision: 'vanta', version: 1 },
  layers: []
})

export const mcpServersList: Handler = async hub => ({
  servers: (await readConnectors(hub)).map(connector => ({
    args: [],
    command: null,
    enabled: isOn(connector),
    env: [],
    name: connector.name,
    tools: connector.tools.length ? connector.tools : null,
    transport: connector.transport,
    url: null
  }))
})

export const mcpServersStatus: Handler = async hub => ({
  checked_at: Math.floor(Date.now() / 1000),
  servers: (await readConnectors(hub)).map(connector => ({
    connected: isOn(connector) && connector.health === 'ready',
    disabled: !isOn(connector),
    name: connector.name,
    source: 'config',
    status: !isOn(connector) ? 'disabled' : connector.health === 'ready' ? 'connected' : 'configured',
    tools: connector.tools.length,
    transport: connector.transport
  }))
})
