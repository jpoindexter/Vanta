import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getSkills, installSkillFromHub, setSkillEnabled } from '@/api/skills'
import { getToolsets, setToolsetEnabled } from '@/api/toolsets'
import type { HermesApiRequest } from '@/global'
import { installRestBridge } from '@/test/rest-bridge'

describe('skills and tools controls reach the Vanta routes', () => {
  let calls: HermesApiRequest[]

  beforeEach(() => {
    calls = []

    installRestBridge(request => {
      calls.push(request)

      if (request.path === '/api/skills') {
        return [{ category: 'finance', description: 'd', enabled: false, name: 'Invoice triage', provenance: 'external', usage: 2 }]
      }

      if (request.path === '/api/skills/install') {
        return { name: 'useful', ok: true, status: 'active' }
      }

      return { enabled: false, name: 'x', ok: true }
    })
    ;(window as { vantaDesktop?: unknown }).vantaDesktop = {}
  })

  afterEach(() => {
    delete (window as { hermesDesktop?: unknown }).hermesDesktop
    delete (window as { vantaDesktop?: unknown }).vantaDesktop
  })

  it('reads the skill list with its enabled state, provenance and usage as served', async () => {
    const [skill] = await getSkills()

    expect(skill).toMatchObject({ enabled: false, name: 'Invoice triage', provenance: 'external', usage: 2 })
  })

  it('toggles a skill on the same path (the transport sends the PUT as a POST)', async () => {
    await setSkillEnabled('Invoice triage', true)

    expect(calls[0]).toMatchObject({ body: { enabled: true, name: 'Invoice triage' }, method: 'PUT', path: '/api/skills/toggle' })
  })

  it('installs a registry skill through the approval-gated install route', async () => {
    const result = await installSkillFromHub('useful')

    expect(result).toMatchObject({ name: 'useful', ok: true })
    expect(calls.find(call => call.path === '/api/skills/install')?.body).toEqual({ slug: 'useful' })
  })

  it('lists tools as toolsets and toggles one by name', async () => {
    await getToolsets()
    await setToolsetEnabled('web fetch', false)

    expect(calls.map(call => [call.method ?? 'GET', call.path])).toEqual([
      ['GET', '/api/tools/toolsets'],
      ['PUT', '/api/tools/toolsets/web%20fetch']
    ])
  })
})
