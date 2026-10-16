import { z } from 'zod'

import type {
  ActionResponse,
  SkillHubPreview,
  SkillHubResult,
  SkillHubScanResult,
  SkillHubSearchResponse,
  SkillHubSource,
  SkillHubSourcesResponse
} from '@/types/desktop'

import { APPROVAL_TIMEOUT_MS, post, type ShimRoute, text } from './shim-core'

const HUB_TIMEOUT_MS = 45_000
const DEFAULT_SEARCH_LIMIT = 20

const installedSchema = z.looseObject({ name: z.string() })
const changedSchema = z.looseObject({ message: z.string() })

const resultSchema = z.looseObject({
  category: z.string().nullable(),
  description: z.string(),
  identifier: z.string(),
  integrity: z.string(),
  name: z.string(),
  provenance: z.string(),
  signature: z.string(),
  source: z.string()
})

const searchSchema = z.looseObject({
  failures: z.array(z.looseObject({ error: z.string(), source: z.string() })),
  results: z.array(resultSchema)
})

const previewSchema = z.looseObject({
  files: z.array(z.looseObject({ bytes: z.number(), path: z.string() })),
  identifier: z.string(),
  integrityOk: z.boolean(),
  name: z.string(),
  risks: z.array(z.string()),
  skillMd: z.string()
})

type HubResult = z.infer<typeof resultSchema>

// What the Skills tab can search, in the order it shows them. skills.sh is the open directory; the others are
// curated GitHub lists the person has added.
const SOURCES: SkillHubSource[] = [
  { available: true, id: 'skills-sh', label: 'skills.sh', searchable: true },
  { available: true, id: 'github', label: 'GitHub (curated)', searchable: true },
  { available: true, id: 'tap', label: 'Your GitHub taps', searchable: true }
]

const githubRepo = (provenance: string): null | string => /github\.com\/([^/]+\/[^/]+)/.exec(provenance)?.[1] ?? null

const trustLevel = (result: HubResult): string => (result.source === 'official' ? 'trusted' : 'community')

const toResult = (result: HubResult): SkillHubResult => ({
  description: result.description,
  identifier: result.identifier,
  name: result.name,
  repo: githubRepo(result.provenance),
  source: result.source,
  tags: result.category ? [result.category] : [],
  trust_level: trustLevel(result)
})

const hubPost = (send: Parameters<ShimRoute['handle']>[0]['send'], path: string, body: unknown, timeoutMs = HUB_TIMEOUT_MS) =>
  post(send, path, body, timeoutMs)

async function loadPreview(send: Parameters<ShimRoute['handle']>[0]['send'], identifier: string) {
  return previewSchema.parse(await hubPost(send, '/api/skills/hub-preview', { identifier }))
}

const toScan = (preview: z.infer<typeof previewSchema>): SkillHubScanResult => {
  const risky = preview.risks.length > 0

  return {
    findings: preview.risks.map(description => ({ category: 'risk', description, file: '', line: null, severity: 'medium' })),
    identifier: preview.identifier,
    name: preview.name,
    policy: !preview.integrityOk ? 'block' : risky ? 'ask' : 'allow',
    policy_reason: !preview.integrityOk ? 'The package failed its integrity check.' : risky ? 'The package declares risky capabilities.' : null,
    severity_counts: risky ? { medium: preview.risks.length } : {},
    source: preview.identifier.split(':')[0] ?? '',
    summary: risky ? `${preview.risks.length} risk(s) to review before installing.` : 'No risks detected.',
    trust_level: 'community',
    verdict: !preview.integrityOk ? 'dangerous' : risky ? 'caution' : 'safe'
  }
}

/** A hub identifier names its source ("skills-sh:owner/repo/skill"); a bare slug is a registry skill. */
const isHubIdentifier = (identifier: string): boolean => identifier.includes(':')

/** The Vanta skills-hub calls, answered by the Vanta hub (skills.sh, GitHub taps) and registry installs. */
export const skillRoutes: readonly ShimRoute[] = [
  {
    handle: async (): Promise<SkillHubSourcesResponse> => ({ featured: [], index_available: false, installed: {}, sources: SOURCES }),
    method: 'GET',
    path: /^\/api\/skills\/hub\/sources$/
  },
  {
    handle: async () => ({ skills: [] }),
    method: 'GET',
    path: /^\/api\/skills\/hub\/official$/
  },
  {
    handle: async ({ query, send }): Promise<SkillHubSearchResponse> => {
      const source = query.get('source') ?? 'all'
      const found = searchSchema.parse(await hubPost(send, '/api/skills/hub-search', { query: query.get('q') ?? '', source }))
      const limit = Number(query.get('limit')) || DEFAULT_SEARCH_LIMIT
      const counts: Record<string, number> = {}

      for (const result of found.results) {
        counts[result.source] = (counts[result.source] ?? 0) + 1
      }

      return { installed: {}, results: found.results.slice(0, limit).map(toResult), source_counts: counts, timed_out: found.failures.map(item => item.source) }
    },
    method: 'GET',
    path: /^\/api\/skills\/hub\/search$/
  },
  {
    handle: async ({ query, send }): Promise<SkillHubPreview> => {
      const preview = await loadPreview(send, query.get('identifier') ?? '')

      return {
        description: '',
        files: preview.files.map(file => file.path),
        identifier: preview.identifier,
        name: preview.name,
        repo: null,
        skill_md: preview.skillMd,
        source: preview.identifier.split(':')[0] ?? '',
        tags: [],
        trust_level: 'community'
      }
    },
    method: 'GET',
    path: /^\/api\/skills\/hub\/preview$/
  },
  {
    handle: async ({ query, send }): Promise<SkillHubScanResult> => toScan(await loadPreview(send, query.get('identifier') ?? '')),
    method: 'GET',
    path: /^\/api\/skills\/hub\/scan$/
  },
  {
    // Editing and archiving a Memory Graph node: one approval card each, answered by the Vanta server.
    handle: async ({ body, send }) => {
      const changed = changedSchema.parse(await post(send, '/api/learning/node-edit', { content: text(body.content), id: text(body.id) }, APPROVAL_TIMEOUT_MS))

      return { message: changed.message, ok: true }
    },
    method: 'PUT',
    path: /^\/api\/learning\/node$/
  },
  {
    handle: async ({ body, send }) => {
      const changed = changedSchema.parse(await post(send, '/api/learning/node-archive', { id: text(body.id) }, APPROVAL_TIMEOUT_MS))

      return { message: changed.message, ok: true }
    },
    method: 'DELETE',
    path: /^\/api\/learning\/node$/
  },
  {
    handle: async ({ body, send }): Promise<ActionResponse> => {
      const identifier = text(body.identifier).trim()
      const path = isHubIdentifier(identifier) ? '/api/skills/hub-install' : '/api/skills/install'
      const payload = isHubIdentifier(identifier) ? { identifier } : { slug: identifier }
      const installed = installedSchema.parse(await post(send, path, payload, APPROVAL_TIMEOUT_MS))

      return { name: installed.name, ok: true, pid: 0 }
    },
    method: 'POST',
    path: /^\/api\/skills\/hub\/install$/
  }
]
