import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getMessagingPlatforms, testMessagingPlatform, updateMessagingPlatform } from '@/api/messaging'
import type { HermesApiRequest } from '@/global'
import { installRestBridge } from '@/test/rest-bridge'

const ADAPTERS = [
  {
    accessMode: 'allowlist',
    configured: true,
    fields: [{ key: 'VANTA_TELEGRAM_TOKEN', label: 'Bot token', required: true, secret: true }],
    id: 'telegram',
    label: 'Telegram',
    missing: [],
    prerequisite: 'A bot from BotFather',
    setupSteps: ['Create a bot'],
    signupUrl: 'https://t.me/BotFather',
    status: 'ready'
  },
  {
    configured: false,
    fields: [{ key: 'SLACK_TOKEN', label: 'Slack token', required: true, secret: true }],
    id: 'slack',
    label: 'Slack',
    missing: ['SLACK_TOKEN'],
    setupSteps: [],
    status: 'needs_setup'
  },
  { configured: false, fields: [], id: 'sms', label: 'SMS', missing: [], setupSteps: [], status: 'unavailable' }
]

describe('Connections reads and saves messaging platforms through the Vanta routes', () => {
  let calls: HermesApiRequest[]

  beforeEach(() => {
    calls = []

    installRestBridge(request => {
      calls.push(request)

      if (request.path === '/api/messaging' && !request.method) {
        return ADAPTERS
      }

      if (request.path === '/api/connect/test') {
        return { message: 'The bot credential is live.', status: 'ready' }
      }

      return { id: 'x' }
    })
    ;(window as { vantaDesktop?: unknown }).vantaDesktop = {}
  })

  afterEach(() => {
    delete (window as { hermesDesktop?: unknown }).hermesDesktop
    delete (window as { vantaDesktop?: unknown }).vantaDesktop
  })

  it('lists every platform with its setup state, never exposing a saved secret', async () => {
    const { platforms } = await getMessagingPlatforms()

    expect(platforms.map(p => [p.id, p.state, p.configured])).toEqual([['telegram', 'gateway_stopped', true], ['slack', 'disabled', false], ['sms', 'disabled', false]])
    expect(platforms[0].env_vars[0]).toMatchObject({ is_password: true, is_set: true, redacted_value: '••••••••' })
    expect(platforms[1].env_vars[0]).toMatchObject({ is_set: false, redacted_value: null })
    expect(platforms[2].error_message).toMatch(/not available/)
  })

  it('saves credentials by their setting name and keeps the Telegram authorization mode', async () => {
    await updateMessagingPlatform('telegram', { env: { VANTA_TELEGRAM_TOKEN: 'abc' } })

    const save = calls.find(call => call.method === 'POST' && call.path === '/api/messaging')

    expect(save?.body).toEqual({ id: 'telegram', values: { VANTA_TELEGRAM_TOKEN: 'abc', accessMode: 'allowlist' } })
  })

  it('does not invent an authorization mode for a platform that has none', async () => {
    await updateMessagingPlatform('slack', { env: { SLACK_TOKEN: 't' } })

    const save = calls.find(call => call.method === 'POST' && call.path === '/api/messaging')

    expect(save?.body).toEqual({ id: 'slack', values: { SLACK_TOKEN: 't' } })
  })

  it('reports a platform that is not in the list as not found instead of saving', async () => {
    await expect(updateMessagingPlatform('nope', { env: {} })).rejects.toThrow(/404/)
    expect(calls.some(call => call.method === 'POST')).toBe(false)
  })

  it('turns the connection check into ok / message', async () => {
    await expect(testMessagingPlatform('telegram')).resolves.toEqual({ message: 'The bot credential is live.', ok: true, state: 'ready' })
  })
})
