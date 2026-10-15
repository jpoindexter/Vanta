import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getOfficialSkills, getSkillHubSources, installSkillFromHub, previewSkillHub, scanSkillHub, searchSkillsHub } from '@/api/skills'
import type { HermesApiRequest } from '@/global'
import { installRestBridge } from '@/test/rest-bridge'

const PREVIEW = {
  files: [{ bytes: 120, path: 'SKILL.md' }, { bytes: 40, path: 'scripts/run.sh' }],
  identifier: 'skills-sh:acme/skills/seo',
  integrityOk: true,
  name: 'seo',
  risks: [] as string[],
  skillMd: '# SEO\nDo the thing.'
}

describe('the Skills tab reads and installs from the hub through the Vanta routes', () => {
  let calls: HermesApiRequest[]
  let preview: typeof PREVIEW

  beforeEach(() => {
    calls = []
    preview = { ...PREVIEW }
    Object.defineProperty(window, 'vantaDesktop', { configurable: true, value: {} })

    installRestBridge((request: HermesApiRequest) => {
      calls.push(request)

      if (request.path === '/api/skills/hub-search') {
        return {
          failures: [{ error: 'rate limited', source: 'github' }],
          results: [
            { category: 'marketing', description: 'Audit pages', identifier: 'skills-sh:acme/skills/seo', integrity: 'content-hashed', name: 'seo', provenance: 'https://github.com/acme/skills/tree/main/seo', signature: 'unsigned', source: 'skills-sh' }
          ]
        }
      }

      if (request.path === '/api/skills/hub-preview') {
        return preview
      }

      return { name: 'seo', ok: true, status: 'active' }
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(window, 'vantaDesktop')
  })

  it('lists skills.sh, curated GitHub and the person\'s taps as sources', async () => {
    const sources = await getSkillHubSources()

    expect(sources.sources.map(source => source.id)).toEqual(['skills-sh', 'github', 'tap'])
    expect(await getOfficialSkills()).toEqual({ skills: [] })
  })

  it('maps search results and reports a failing source as timed out', async () => {
    const found = await searchSkillsHub('seo', 'all', 5)

    expect(found.results).toEqual([
      { description: 'Audit pages', identifier: 'skills-sh:acme/skills/seo', name: 'seo', repo: 'acme/skills', source: 'skills-sh', tags: ['marketing'], trust_level: 'community' }
    ])
    expect(found.timed_out).toEqual(['github'])
    expect(found.source_counts).toEqual({ 'skills-sh': 1 })
    expect(calls.at(-1)).toMatchObject({ body: { query: 'seo', source: 'all' }, method: 'POST', path: '/api/skills/hub-search' })
  })

  it('previews the SKILL.md and file list', async () => {
    const result = await previewSkillHub('skills-sh:acme/skills/seo')

    expect(result).toMatchObject({ files: ['SKILL.md', 'scripts/run.sh'], name: 'seo', skill_md: '# SEO\nDo the thing.' })
  })

  it('turns declared risks into a scan that asks before installing, and a failed hash into a block', async () => {
    expect(await scanSkillHub('skills-sh:acme/skills/seo')).toMatchObject({ policy: 'allow', verdict: 'safe' })

    preview = { ...PREVIEW, risks: ['runs shell commands'] }
    expect(await scanSkillHub('skills-sh:acme/skills/seo')).toMatchObject({ policy: 'ask', verdict: 'caution', findings: [{ description: 'runs shell commands' }] })

    preview = { ...PREVIEW, integrityOk: false }
    expect(await scanSkillHub('skills-sh:acme/skills/seo')).toMatchObject({ policy: 'block', verdict: 'dangerous' })
  })

  it('installs a source-qualified identifier from the hub and a bare slug from the registry', async () => {
    await installSkillFromHub('skills-sh:acme/skills/seo')
    expect(calls.at(-1)).toMatchObject({ body: { identifier: 'skills-sh:acme/skills/seo' }, path: '/api/skills/hub-install' })

    await installSkillFromHub('useful')
    expect(calls.at(-1)).toMatchObject({ body: { slug: 'useful' }, path: '/api/skills/install' })
  })
})
