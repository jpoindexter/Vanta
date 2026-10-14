// @vitest-environment node
import type { GatewayEvent } from '@hermes/shared'
import { createHttpTransport } from '@hermes/shared/vanta'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  restoreServerEnv,
  startRealServer,
  vantaRuntimeAvailable,
  warmRealServer
} from '@/api/vanta/integration-server'
import { VantaGateway } from '@/api/vanta-gateway'
import { imageBudgetError, imageFromBlob, promptImages } from '@/lib/composer-images'
import type { ComposerAttachment } from '@/store/composer'

type Seen = { content?: unknown; images?: Array<{ dataBase64: string; mime: string }>; role: string }

// The real server runs its real agent loop; only the model is a recorder, so the test can see what the
// model was handed after the request body went through the server's own parsing and limits.
const modelSaw: Seen[][] = vi.hoisted(() => [])

vi.mock('@/api/vanta/scripted-provider', () => ({
  scriptedProvider: () => ({
    contextWindow: () => 100_000,
    modelId: () => 'stub-model',
    async complete() {
      return { finishReason: 'stop', text: 'stub', toolCalls: [] }
    },
    stream(messages: Seen[]) {
      modelSaw.push(messages.map(m => ({ ...m })))

      return (async function* () {
        yield { delta: 'I see it', type: 'text' }
        yield { result: { finishReason: 'stop', text: 'I see it', toolCalls: [] }, type: 'done' }
      })()
    }
  })
}))

// 1x1 PNG
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+GkZcAAAAASUVORK5CYII='

const closers: Array<() => unknown> = []

afterAll(restoreServerEnv)

afterEach(async () => {
  modelSaw.length = 0

  for (const close of closers.splice(0)) {
    await close()
  }
})

async function waitFor<T>(read: () => T | undefined | false, what: string): Promise<T> {
  const deadline = Date.now() + 15_000

  for (;;) {
    const value = read()

    if (value) {
      return value
    }

    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`)
    }

    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

async function openChat() {
  const server = await startRealServer()
  closers.push(() => server.close())
  const events: GatewayEvent[] = []

  const gateway = new VantaGateway({
    approvalPollMs: 0,
    log: () => undefined,
    transport: createHttpTransport({ baseUrl: server.baseUrl, token: server.token })
  })

  closers.push(() => gateway.close())
  gateway.onAny(event => events.push(event))
  await gateway.connect('vanta://local')
  const chat = await gateway.request<{ session_id: string }>('session.create', {})

  return { chat, events, gateway }
}

describe.skipIf(!vantaRuntimeAvailable)('an image attached in the composer reaches the real server', () => {
  beforeAll(warmRealServer, 120_000)

  it('sends a pasted PNG as images[] and the model receives it', { timeout: 60_000 }, async () => {
    const { chat, events, gateway } = await openChat()

    // The composer's own pipeline: read the pasted file, check the limits, hold it as a chip, take images[] from the chips.
    const png = new File([Uint8Array.from(atob(PNG_B64), c => c.charCodeAt(0))], 'pasted.png', { type: 'image/png' })
    const read = await imageFromBlob(png, 'pasted.png')

    expect(read.ok).toBe(true)
    expect(imageBudgetError([], read.ok ? read.image : { dataBase64: '', mime: '' })).toBeNull()

    const chip: ComposerAttachment = {
      id: 'image:pasted.png',
      imageData: read.ok ? read.image : undefined,
      kind: 'image',
      label: 'pasted.png'
    }

    const images = promptImages([chip])

    expect(images).toEqual([{ dataBase64: PNG_B64, mime: 'image/png' }])

    await gateway.request('prompt.submit', { images, session_id: chat.session_id, text: 'what is this?' })
    await waitFor(() => events.find(e => e.type === 'message.complete'), 'message.complete')

    const user = modelSaw[0]?.filter(m => m.role === 'user').at(-1)

    expect(String(user?.content)).toContain('what is this?')
    expect(user?.images).toEqual([{ dataBase64: PNG_B64, mime: 'image/png' }])
  })

  it('tells the user when the server refuses an image over its size limit', { timeout: 60_000 }, async () => {
    const { chat, events, gateway } = await openChat()
    const oversize = 'A'.repeat(Math.ceil(((10 * 1024 * 1024 + 4096) * 4) / 3 / 4) * 4)

    await gateway.request('prompt.submit', {
      images: [{ dataBase64: oversize, mime: 'image/png' }],
      session_id: chat.session_id,
      text: 'too big'
    })

    const failure = await waitFor(() => events.find(e => e.type === 'error'), 'error event')

    expect(JSON.stringify(failure.payload)).toMatch(/10 MB/)
    expect(modelSaw).toHaveLength(0)
  })
})
