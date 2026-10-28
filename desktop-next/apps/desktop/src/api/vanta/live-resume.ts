import { z } from 'zod'

import { fetchPendingApproval } from './approvals'
import type { ChatClient } from './client-registry'
import { attachStream } from './client-stream'
import type { GatewayHub } from './hub'
import { expectOk, parseBody } from './rpc'
import { chatResultSchema, openSessionSchema } from './schemas'
import { sessionInfo } from './session-info'
import { toTranscript } from './transcript'
import { finishFromChat } from './turn-runner'

const liveSchema = z.object({
  clientId: z.string().regex(/^[a-z0-9-]{1,128}$/i),
  requestId: z.string().regex(/^[a-z0-9-]{1,80}$/i),
  root: z.string().min(1).max(8192),
  profile: z.string().min(1).max(64),
  running: z.boolean(),
  result: chatResultSchema.optional()
}).refine(live => live.running ? live.result === undefined : live.result !== undefined,
  'A recovered turn needs either live work or its authoritative terminal result')

export const resumeSessionSchema = openSessionSchema.extend({
  live: liveSchema.optional(), modelId: z.string().optional(), providerId: z.string().optional()
})
type Opened = z.infer<typeof resumeSessionSchema>
type Live = z.infer<typeof liveSchema>
const recoveredTurns = new WeakMap<ChatClient, Live>()

function requireSameTurn(opened: Opened, client: ChatClient, live: Live): void {
  const next = opened.live
  if (opened.id !== client.storedId || !next || next.clientId !== client.clientId ||
      next.requestId !== live.requestId || next.root !== live.root || next.profile !== live.profile ||
      (next.result?.sessionId && next.result.sessionId !== client.storedId)) {
    throw new Error('The waiting conversation identity changed; no action was retried.')
  }
}

/** Observe the original turn, never POST another chat. Readback repairs a missed terminal frame. */
function observeLiveTurn(hub: GatewayHub, client: ChatClient, live: Live): { stop: () => void; ready: Promise<void> } {
  const turn = client.turn
  const generation = hub.connectionGeneration
  let stopped = false, timer: ReturnType<typeof setTimeout> | undefined
  const current = () => !stopped && hub.state === 'open' && hub.connectionGeneration === generation &&
    hub.registry.get(client.clientId) === client && client.turn === turn
  const tick = async () => {
    try {
      const query = new URLSearchParams({ storedId: client.storedId!, requestId: live.requestId })
      const result = await hub.caller.get(client, '/api/sessions/live?' + query, { timeoutMs: 10_000 })
      if (!current()) return
      const opened = parseBody(resumeSessionSchema, expectOk(result, 'live session readback'), 'live session readback')
      requireSameTurn(opened, client, live)
      if (opened.live!.result) finishFromChat(hub, client, opened.live!.result)
      else {
        const approval = await fetchPendingApproval(hub, client)
        if (current() && approval) hub.deliverApproval(client, approval)
      }
    } catch {
      if (current()) hub.warn('Live session readback failed; the original turn remains unverified, not completed.')
    }
    if (current()) timer = setTimeout(tick, hub.approvalPollMs || 1500)
  }
  return { ready: tick(), stop: () => { stopped = true; clearTimeout(timer) } }
}

function recoveredClient(hub: GatewayHub, probe: ChatClient, opened: Opened): ChatClient {
  const live = opened.live!
  const known = hub.registry.get(live.clientId)
  if (known && known.storedId !== opened.id) throw new Error('The live runtime belongs to another conversation.')
  if (known?.turn && known.turn.requestId !== live.requestId) throw new Error('The live runtime has a different active request.')
  const client = known ?? hub.registry.create(live.clientId)
  if (probe !== client) hub.registry.remove(probe.clientId)
  return client
}

export function pauseLiveObservation(client: ChatClient): void {
  if (client.turn?.requestId !== recoveredTurns.get(client)?.requestId) return
  client.stopApprovalPoll?.()
  client.stopApprovalPoll = null
}

export async function resumeLiveObservation(hub: GatewayHub, client: ChatClient): Promise<void> {
  const live = recoveredTurns.get(client)
  if (!live || client.turn?.requestId !== live.requestId || client.stopApprovalPoll) return
  const observer = observeLiveTurn(hub, client, live)
  client.stopApprovalPoll = observer.stop
  await observer.ready
}

export async function adoptLiveSession(hub: GatewayHub, probe: ChatClient, opened: Opened): Promise<ChatClient> {
  if (opened.live?.result?.sessionId && opened.live.result.sessionId !== opened.id) {
    throw new Error('The recovered result belongs to another conversation.')
  }
  const live = opened.live!, client = recoveredClient(hub, probe, opened)
  if (client.completedRequestId === live.requestId) return client
  const generation = hub.connectionGeneration
  client.storedId = opened.id
  client.title = opened.title ?? client.title
  client.transcript = toTranscript(opened.messages)
  client.cwd = live.root
  client.model = opened.modelId ?? client.model
  client.provider = opened.providerId ?? client.provider
  client.turn ??= { completed: false, controller: new AbortController(), requestId: live.requestId }
  recoveredTurns.set(client, live)
  if (live.result) finishFromChat(hub, client, live.result, true)
  attachStream(hub, client)
  await resumeLiveObservation(hub, client)
  if (hub.state !== 'open' || hub.connectionGeneration !== generation) throw new Error('The connection changed while recovering this chat.')
  hub.emit(client.clientId, 'session.info', sessionInfo(client, Boolean(client.turn)))
  return client
}
