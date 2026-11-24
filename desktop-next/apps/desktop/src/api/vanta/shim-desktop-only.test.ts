import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getWebhooks } from '@/api/messaging'
import { getTerminalBackends, getToolsetConfig } from '@/api/toolsets'
import { getElevenLabsVoices } from '@/api/system'
import { getUsageAnalytics } from '@/api/models'
import type { VantaApiRequest } from '@/global'
import { installRestBridge } from '@/test/rest-bridge'

describe('Vanta-only reads answer with an empty state instead of a 404', () => {
  let reached: VantaApiRequest[]

  beforeEach(() => {
    reached = []

    installRestBridge(request => {
      reached.push(request)

      throw new Error('404: not found')
    })
    ;(window as { vantaDesktop?: unknown }).vantaDesktop = {}
  })

  afterEach(() => {
    delete (window as { desktopBridge?: unknown }).desktopBridge
    delete (window as { vantaDesktop?: unknown }).vantaDesktop
  })

  it('has no per-tool provider to configure', async () => {
    await expect(getToolsetConfig('web')).resolves.toMatchObject({ active_provider: null, has_category: false, name: 'web', providers: [] })
    expect(reached).toHaveLength(0)
  })

  it('offers one terminal backend, the Vanta sandbox, as ready and active', async () => {
    const { active, backends } = await getTerminalBackends()

    expect(active).toBe('sandbox')
    expect(backends).toEqual([expect.objectContaining({ active: true, name: 'sandbox', status: 'ready' })])
  })

  it('has no hosted voices and no usage analytics, and keeps the requested period', async () => {
    await expect(getElevenLabsVoices()).resolves.toEqual({ available: false, voices: [] })
    await expect(getUsageAnalytics(7)).resolves.toMatchObject({ by_model: [], period_days: 7, totals: { total_sessions: 0 } })
    expect(reached).toHaveLength(0)
  })

  it('still lets an unrelated path reach the server and fail loudly', async () => {
    await expect(getWebhooks()).rejects.toThrow(/404/)
    expect(reached.map(call => call.path)).toEqual(['/api/webhooks'])
  })
})
