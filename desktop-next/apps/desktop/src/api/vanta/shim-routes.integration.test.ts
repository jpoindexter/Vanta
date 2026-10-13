// @vitest-environment node
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { GatewayEvent, ServerRequest } from '@hermes/shared'
import { createHttpTransport } from '@hermes/shared/vanta'
import { remapMethod } from '@hermes/shared/vanta/api-path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { HermesApiRequest } from '@/global'

import { vantaRestShim } from './rest-shim'
import { type RealServer, restoreServerEnv, startRealServer, vantaRuntimeAvailable, warmRealServer } from './integration-server'
import { VantaGateway } from '../vanta-gateway'

// The renderer's REST shim and gateway talking to the REAL Vanta desktop server (real stores in a
// temporary VANTA_HOME): this is the path a Hermes control takes from click to disk and back.

const servers: RealServer[] = []
const gateways: VantaGateway[] = []

afterAll(restoreServerEnv)

afterEach(async () => {
  gateways.splice(0).forEach(gateway => gateway.close())
  await Promise.all(servers.splice(0).map(server => server.close()))
  delete process.env.VANTA_SKILL_REGISTRY
})

async function boot() {
  const server = await startRealServer()
  servers.push(server)

  const transport = createHttpTransport({ baseUrl: server.baseUrl, token: server.token })
  const gateway = new VantaGateway({ approvalPollMs: 25, log: () => undefined, transport })
  gateways.push(gateway)
  const events: GatewayEvent[] = []
  const requests: ServerRequest[] = []
  gateway.onAny(event => events.push(event))
  gateway.onRequest(request => {
    requests.push(request)
  })
  await gateway.connect('vanta://local')

  // What hermesDesktop.api does in the Electron main process: PUT/PATCH/DELETE go out as POST.
  const send = async (request: HermesApiRequest): Promise<unknown> => {
    const result = await transport.request({
      body: request.body,
      clientId: request.clientId ?? 'vanta-gateway-probe',
      method: remapMethod(request.method),
      path: request.path,
      timeoutMs: request.timeoutMs
    })

    if (!result.ok) {
      throw new Error(`${result.status}: ${JSON.stringify(result.data)}`)
    }

    return result.data
  }

  // hermesApi: the shim answers what it maps, everything else goes straight through.
  const api = <T>(request: HermesApiRequest): Promise<T> =>
    (vantaRestShim(request, send) ?? send(request)) as Promise<T>

  return { api, events, gateway, requests, server }
}

async function waitFor<T>(read: () => T | undefined | false, what: string, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs

  for (;;) {
    const value = read()

    if (value) {
      return value
    }

    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`)
    }

    await new Promise(resolve => setTimeout(resolve, 15))
  }
}

describe.skipIf(!vantaRuntimeAvailable)('Hermes controls over the REST shim against the real server', { timeout: 60_000 }, () => {
  beforeAll(warmRealServer, 120_000)

  it('manages profiles end to end, and imports one only after the approval card is answered', async () => {
    const { api, gateway, requests } = await boot()
    await gateway.request('session.create', {})

    await api({ body: { name: 'research' }, method: 'POST', path: '/api/profiles' })
    await api({ body: { new_name: 'Research Lab' }, method: 'PATCH', path: '/api/profiles/research' })
    await api({ body: { content: 'Be brief.' }, method: 'PUT', path: '/api/profiles/research/soul' })

    const listed = await api<{ profiles: Array<{ display_name?: string; is_default: boolean; name: string }> }>({ path: '/api/profiles' })

    expect(listed.profiles.map(row => row.name)).toEqual(['default', 'research'])
    expect(listed.profiles[1]?.display_name).toBe('Research Lab')
    expect(await api({ path: '/api/profiles/research/soul' })).toEqual({ content: 'Be brief.', exists: true })

    const exported = await api<{ archive: string }>({ body: {}, method: 'POST', path: '/api/profiles/research/export' })
    const manifestPath = path.join(exported.archive, 'vanta-profile.json')
    await writeFile(manifestPath, JSON.stringify({ ...JSON.parse(await readFile(manifestPath, 'utf8')), name: 'Imported Copy' }))

    const importing = api<{ name: string; ok: boolean }>({ body: { archive: exported.archive }, method: 'POST', path: '/api/profiles/import' })
    const asked = await waitFor(() => requests[0], 'the import approval card')

    expect(asked.params).toMatchObject({ tool_name: 'profile_import' })
    expect(String(asked.params.command)).toContain('SOUL.md')
    expect(asked.params.allow_permanent).toBe(false)
    asked.respond({ choice: 'once' })

    await expect(importing).resolves.toMatchObject({ name: 'imported-copy', ok: true })
    expect((await api<{ profiles: unknown[] }>({ path: '/api/profiles' })).profiles).toHaveLength(3)
  })

  it('creates, pauses, resumes, runs and lists schedules through the Cron controls', async () => {
    const { api } = await boot()

    const created = await api<{ id: string; schedule_display: string }>({
      body: { prompt: 'summarise inbox', schedule: '0 9 * * *' },
      method: 'POST',
      path: '/api/cron/jobs'
    })

    expect(created).toMatchObject({ id: '1', schedule_display: '0 9 * * *' })
    expect((await api<{ state: string }>({ body: {}, method: 'POST', path: '/api/cron/jobs/1/pause' })).state).toBe('paused')
    expect((await api<{ state: string }>({ body: {}, method: 'POST', path: '/api/cron/jobs/1/resume' })).state).toBe('scheduled')
    expect((await api<Array<{ id: string }>>({ path: '/api/cron/jobs' })).map(job => job.id)).toEqual(['1'])
    expect((await api<{ blueprints: Array<{ key: string }> }>({ path: '/api/cron/blueprints?profile=default' })).blueprints.map(b => b.key)).toContain('daily-brief')
    expect((await api<{ runs: unknown[] }>({ path: '/api/cron/jobs/1/runs' })).runs).toEqual([])
    await api({ method: 'DELETE', path: '/api/cron/jobs/1' })
    expect(await api<unknown[]>({ path: '/api/cron/jobs' })).toEqual([])
  })

  it('searches a finished chat, marks it unread, exports its transcript, branches it, and feeds the context meter', async () => {
    const { api, events, gateway, server } = await boot()
    const chat = await gateway.request<{ session_id: string; stored_session_id: string }>('session.create', {})
    await gateway.request('prompt.submit', { session_id: chat.session_id, text: 'hello' })
    await waitFor(() => events.find(e => e.type === 'message.complete' && e.session_id === chat.session_id), 'message.complete')

    const tick = await waitFor(() => events.find(e => e.type === 'session.usage' && e.session_id === chat.session_id), 'session.usage')

    expect((tick.payload as { usage: Record<string, unknown> }).usage).toMatchObject({
      calls: 1,
      context_estimated: true,
      context_max: 100_000,
      input: 11,
      output: 7,
      total: 18
    })

    const found = await api<{ results: Array<{ session_id: string; snippet: string }> }>({ path: '/api/sessions/search?q=hi%20there' })

    expect(found.results.map(r => r.session_id)).toEqual([chat.stored_session_id])

    await api({ body: { unread: true }, method: 'PATCH', path: `/api/sessions/${chat.stored_session_id}` })
    const rows = await api<{ sessions: Array<{ id: string; unread?: boolean }> }>({ path: '/api/profiles/sessions?min_messages=0' })

    expect(rows.sessions.find(row => row.id === chat.stored_session_id)?.unread).toBe(true)

    const transcript = await api<{ messages: Array<{ role: string; text: string }> }>({ path: `/api/sessions/${chat.stored_session_id}/messages` })

    expect(transcript.messages.map(m => [m.role, m.text])).toEqual([['user', 'hello'], ['assistant', 'Hi there']])

    const branch = await gateway.request<{ stored_session_id: string }>('session.branch_whole', { session_id: chat.session_id })

    expect(branch.stored_session_id).not.toBe(chat.stored_session_id)
    expect(await readFile(path.join(server.home, 'sessions', `${branch.stored_session_id}.json`), 'utf8')).toContain('Hi there')
  })

  it('toggles a skill and a tool, and installs a registry skill only after approval', async () => {
    const { api, gateway, requests, server } = await boot()
    await gateway.request('session.create', {})
    const skillDir = path.join(server.home, 'skills', 'noisy')
    await mkdir(skillDir, { recursive: true })
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: noisy\ndescription: Noisy skill\ncreated: 2026-10-13T00:00:00Z\nupdated: 2026-10-13T00:00:00Z\ntags: []\n---\nbody\n')

    expect((await api<Array<{ enabled: boolean; name: string }>>({ path: '/api/skills' })).find(s => s.name === 'noisy')?.enabled).toBe(true)
    await api({ body: { enabled: false, name: 'noisy' }, method: 'PUT', path: '/api/skills/toggle' })
    expect((await api<Array<{ enabled: boolean; name: string }>>({ path: '/api/skills' })).find(s => s.name === 'noisy')?.enabled).toBe(false)

    await api({ body: { enabled: false }, method: 'PUT', path: '/api/tools/toolsets/web_fetch' })
    expect((await api<Array<{ enabled: boolean; name: string }>>({ path: '/api/tools/toolsets' })).find(t => t.name === 'web_fetch')?.enabled).toBe(false)

    const registry = path.join(server.projectRoot, 'registry')
    await mkdir(path.join(registry, 'useful'), { recursive: true })
    const content = '---\nname: useful\ndescription: Registry skill\ncreated: 2026-10-13T00:00:00Z\nupdated: 2026-10-13T00:00:00Z\ntags: []\n---\nDo it.\n'
    await writeFile(path.join(registry, 'useful', 'SKILL.md'), content)
    await writeFile(path.join(registry, 'index.json'), JSON.stringify({ skills: [{ description: 'Registry skill', name: 'useful', sha256: createHash('sha256').update(content).digest('hex'), slug: 'useful', source: 'useful/SKILL.md', version: '1.0.0' }], version: 1 }))
    process.env.VANTA_SKILL_REGISTRY = path.join(registry, 'index.json')

    const installing = api<{ name: string }>({ body: { identifier: 'useful' }, method: 'POST', path: '/api/skills/hub/install' })
    const asked = await waitFor(() => requests.find(r => (r.params as { tool_name?: string }).tool_name === 'skill_install'), 'the install approval card')

    expect(String(asked.params.command)).toContain('install skill useful v1.0.0')
    asked.respond({ choice: 'once' })
    await expect(installing).resolves.toMatchObject({ name: 'useful', ok: true })
    expect((await api<Array<{ name: string }>>({ path: '/api/skills' })).map(s => s.name)).toContain('useful')
  })

  it('creates, renames, activates and deletes a named project through the projects RPCs', async () => {
    const { gateway, server } = await boot()
    await mkdir(path.join(server.projectRoot, 'acme'), { recursive: true })

    const made = await gateway.request<{ project: { id: string } }>('projects.create', {
      name: 'Acme',
      primary_path: path.join(server.projectRoot, 'acme'),
      use: true
    })

    await gateway.request('projects.update', { id: made.project.id, name: 'Acme Corp' })
    const listed = await gateway.request<{ active_id: string; projects: Array<{ name: string }> }>('projects.list', {})

    expect(listed).toMatchObject({ active_id: made.project.id, projects: [{ name: 'Acme Corp' }] })
    expect(await gateway.request('projects.delete', { id: made.project.id })).toEqual({ active_id: null, projects: [] })
  })
})
