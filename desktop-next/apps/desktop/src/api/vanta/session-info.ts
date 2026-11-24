import type { ChatClient } from './client-registry'
import { statusSchema } from './schemas'
import type { GatewayHub } from './hub'

const APPROVAL_MODE_FOR_ACCESS: Record<string, string> = {
  approve: 'smart',
  ask: 'manual',
  auto: 'smart',
  full: 'off',
  plan: 'manual'
}

/** The Vanta `session.info` body for a client. Fields Vanta has no equivalent for are left out, not invented. */
export function sessionInfo(client: ChatClient, running = false): Record<string, unknown> {
  return {
    ...(client.cwd ? { cwd: client.cwd } : {}),
    ...(client.model ? { model: client.model } : {}),
    ...(client.provider ? { provider: client.provider } : {}),
    running,
    skills: {},
    stored_session_id: client.storedId ?? undefined,
    title: client.title,
    tools: {},
    version: 'vanta'
  }
}

export function approvalModeForAccess(mode: string | undefined): string {
  return APPROVAL_MODE_FOR_ACCESS[mode ?? ''] ?? 'manual'
}

/** Fill model/provider/cwd from `GET /api/status`. A failure leaves the info sparse; it never blocks the chat. */
export async function refreshInfo(hub: GatewayHub, client: ChatClient): Promise<void> {
  const result = await hub.caller.get(client, '/api/status')
  const parsed = result.ok ? statusSchema.safeParse(result.data) : null

  if (!parsed?.success) {
    return
  }

  client.model = parsed.data.model ?? client.model
  client.provider = parsed.data.provider ?? client.provider
  client.cwd = parsed.data.root ?? client.cwd
}
