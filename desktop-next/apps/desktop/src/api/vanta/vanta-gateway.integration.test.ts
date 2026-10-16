// @vitest-environment node
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { GatewayEvent, ServerRequest } from '@vanta/shared'
import { createHttpTransport } from '@vanta/shared/vanta'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { VantaGateway } from '../vanta-gateway'

import {
  type RealServer,
  restoreServerEnv,
  startRealServer,
  warmRealServer,
  vantaRuntimeAvailable,
  writeProjectFile
} from './integration-server'

const servers: RealServer[] = []
const gateways: VantaGateway[] = []

afterAll(restoreServerEnv)

afterEach(async () => {
  gateways.splice(0).forEach(gateway => gateway.close())
  await Promise.all(servers.splice(0).map(server => server.close()))
})

async function boot(options: { home?: string; projectRoot?: string } = {}) {
  const server = await startRealServer(options)
  servers.push(server)

  return server
}

async function connect(server: RealServer, token = server.token, approvalPollMs = 25) {
  const gateway = new VantaGateway({
    approvalPollMs,
    log: () => undefined,
    transport: createHttpTransport({ baseUrl: server.baseUrl, token })
  })
  gateways.push(gateway)
  const events: GatewayEvent[] = []
  const requests: ServerRequest[] = []
  gateway.onAny(event => events.push(event))
  gateway.onRequest(request => {
    requests.push(request)
  })
  await gateway.connect('vanta://local')

  return {
    events,
    gateway,
    requests,
    of: (type: string, sid?: string) => events.filter(e => e.type === type && (!sid || e.session_id === sid))
  }
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

interface Created {
  info: Record<string, unknown>
  session_id: string
  stored_session_id: string
}

describe.skipIf(!vantaRuntimeAvailable)(
  'VantaGateway against the real Vanta desktop server',
  { timeout: 60_000 },
  () => {
    beforeAll(warmRealServer, 120_000)

    it('refuses to connect with the wrong boundary token', async () => {
      const server = await boot()
      const gateway = new VantaGateway({
        approvalPollMs: 0,
        log: () => undefined,
        transport: createHttpTransport({ baseUrl: server.baseUrl, token: 'wrong' })
      })
      gateways.push(gateway)

      await expect(gateway.connect('vanta://local')).rejects.toThrow('HTTP 403')
      expect(gateway.connectionState).toBe('error')
    })

    it('creates a session, streams a turn and completes it, persists the transcript, and lists and resumes it', async () => {
      const server = await boot()
      const { gateway, of } = await connect(server)

      const created = await gateway.request<Created>('session.create', {})
      expect(created.info).toMatchObject({ cwd: server.projectRoot, model: 'stub-model' })

      await expect(
        gateway.request('prompt.submit', { session_id: created.session_id, text: 'hello' })
      ).resolves.toEqual({ status: 'streaming' })
      const done = await waitFor(() => of('message.complete', created.session_id)[0], 'message.complete')

      expect(done.payload).toMatchObject({ status: 'complete', text: 'Hi there' })
      expect(of('message.start', created.session_id)).toHaveLength(1)
      expect(
        of('message.delta', created.session_id)
          .map(e => (e.payload as { text: string }).text)
          .join('')
      ).toBe('Hi there')

      const listed = await gateway.request<{ sessions: Array<{ id: string }> }>('session.list', {})
      expect(listed.sessions.map(s => s.id)).toContain(created.stored_session_id)

      // A second window (new gateway, new client id) opens the persisted chat.
      const other = await connect(server)
      const resumed = await other.gateway.request<{
        messages: Array<{ role: string; text: string }>
        stored_session_id: string
      }>('session.resume', { session_id: created.stored_session_id })

      expect(resumed.stored_session_id).toBe(created.stored_session_id)
      expect(resumed.messages.map(m => [m.role, m.text])).toEqual([
        ['user', 'hello'],
        ['assistant', 'Hi there']
      ])
    })

    it('shows live tool steps and gates the edit behind an exact-action approval; Allow once runs it', async () => {
      const server = await boot()
      await writeProjectFile(server.projectRoot, 'notes.md', 'before')
      const { gateway, of, requests } = await connect(server)
      const chat = await gateway.request<Created>('session.create', {})

      await gateway.request('prompt.submit', { session_id: chat.session_id, text: 'edit notes.md' })
      const asked = await waitFor(() => requests[0], 'approval request')

      expect(asked.method).toBe('approval')
      expect(asked.params).toMatchObject({ session_id: chat.session_id, tool_name: 'edit_file' })
      expect(String(asked.params.command)).toContain('notes.md')
      expect(await readFile(path.join(server.projectRoot, 'notes.md'), 'utf8')).toBe('before')

      asked.respond({ choice: 'once' })
      await waitFor(() => of('message.complete', chat.session_id)[0], 'message.complete')

      expect(await readFile(path.join(server.projectRoot, 'notes.md'), 'utf8')).toBe('after')
      expect(of('tool.start', chat.session_id)[0]?.payload).toMatchObject({ name: 'edit_file' })
      expect(of('tool.complete', chat.session_id)[0]?.payload).toMatchObject({ name: 'edit_file' })
    })

    it('Reject leaves the file untouched and the turn still ends', async () => {
      const server = await boot()
      await writeProjectFile(server.projectRoot, 'keep.md', 'before')
      const { gateway, of, requests } = await connect(server)
      const chat = await gateway.request<Created>('session.create', {})

      await gateway.request('prompt.submit', { session_id: chat.session_id, text: 'edit keep.md' })
      const asked = await waitFor(() => requests[0], 'approval request')
      asked.respond({ choice: 'deny' })
      const done = await waitFor(() => of('message.complete', chat.session_id)[0], 'message.complete')

      expect(await readFile(path.join(server.projectRoot, 'keep.md'), 'utf8')).toBe('before')
      expect(done.payload).toBeDefined()
    })

    it('Always allow is remembered per project: a new chat and a restarted server do not ask again, another project still does', async () => {
      const first = await boot()
      await writeProjectFile(first.projectRoot, 'a.md', 'before')
      await writeProjectFile(first.projectRoot, 'b.md', 'before')
      const one = await connect(first)
      const chatOne = await one.gateway.request<Created>('session.create', {})

      await one.gateway.request('prompt.submit', { session_id: chatOne.session_id, text: 'edit a.md' })
      const asked = await waitFor(() => one.requests[0], 'approval request')
      asked.respond({ choice: 'always' })
      await waitFor(() => one.of('message.complete', chatOne.session_id)[0], 'first turn')
      expect(await readFile(path.join(first.home, 'permissions.tsv'), 'utf8')).toContain('allow\tedit_file')

      // Same server, brand new chat.
      const chatTwo = await one.gateway.request<Created>('session.create', {})
      await one.gateway.request('prompt.submit', { session_id: chatTwo.session_id, text: 'edit b.md' })
      await waitFor(() => one.of('message.complete', chatTwo.session_id)[0], 'second turn')
      expect(one.requests).toHaveLength(1)
      expect(await readFile(path.join(first.projectRoot, 'b.md'), 'utf8')).toBe('after')

      // The app restarts: same saved state on disk, a fresh server process state.
      await first.close()
      servers.splice(servers.indexOf(first), 1)
      const restarted = await boot({ home: first.home, projectRoot: first.projectRoot })
      await writeProjectFile(restarted.projectRoot, 'c.md', 'before')
      const afterRestart = await connect(restarted)
      const chatThree = await afterRestart.gateway.request<Created>('session.create', {})
      await afterRestart.gateway.request('prompt.submit', { session_id: chatThree.session_id, text: 'edit c.md' })
      await waitFor(() => afterRestart.of('message.complete', chatThree.session_id)[0], 'turn after restart')
      expect(afterRestart.requests).toHaveLength(0)
      expect(await readFile(path.join(restarted.projectRoot, 'c.md'), 'utf8')).toBe('after')

      // A different project still asks.
      const elsewhere = await boot({ home: first.home })
      await writeProjectFile(elsewhere.projectRoot, 'd.md', 'before')
      const other = await connect(elsewhere)
      const chatFour = await other.gateway.request<Created>('session.create', {})
      await other.gateway.request('prompt.submit', { session_id: chatFour.session_id, text: 'edit d.md' })
      await waitFor(() => other.requests[0], 'approval in the other project')
      expect(await readFile(path.join(elsewhere.projectRoot, 'd.md'), 'utf8')).toBe('before')
    })

    it('runs two chats concurrently: one waiting on an approval does not block the other', async () => {
      const server = await boot()
      await writeProjectFile(server.projectRoot, 'wait.md', 'before')
      const { gateway, of, requests } = await connect(server)
      const blocked = await gateway.request<Created>('session.create', {})
      const free = await gateway.request<Created>('session.create', {})

      await gateway.request('prompt.submit', { session_id: blocked.session_id, text: 'edit wait.md' })
      await waitFor(() => requests[0], 'approval request for the first chat')
      await gateway.request('prompt.submit', { session_id: free.session_id, text: 'hello' })
      const done = await waitFor(() => of('message.complete', free.session_id)[0], 'the second chat finishing')

      expect(done.payload).toMatchObject({ status: 'complete', text: 'Hi there' })
      expect(of('message.complete', blocked.session_id)).toHaveLength(0)
      expect(requests[0]?.params.session_id).toBe(blocked.session_id)

      requests[0]?.respond({ choice: 'once' })
      await waitFor(() => of('message.complete', blocked.session_id)[0], 'the first chat finishing')
    })

    it('interrupts a running turn and reports it as interrupted', async () => {
      const server = await boot()
      const { gateway, of } = await connect(server)
      const chat = await gateway.request<Created>('session.create', {})

      await gateway.request('prompt.submit', { session_id: chat.session_id, text: 'hang until stopped' })
      await waitFor(() => of('message.delta', chat.session_id)[0], 'streamed text before the stop')
      await expect(gateway.request('session.interrupt', { session_id: chat.session_id })).resolves.toEqual({
        interrupted: true,
        status: 'interrupted'
      })
      const done = await waitFor(() => of('message.complete', chat.session_id)[0], 'message.complete')

      expect(done.payload).toMatchObject({ status: 'interrupted' })
    })

    it('renames, archives and trashes through the real routes', async () => {
      const server = await boot()
      const { gateway } = await connect(server)
      const chat = await gateway.request<Created>('session.create', {})

      await expect(
        gateway.request('session.title', { session_id: chat.session_id, title: 'Plan' })
      ).resolves.toMatchObject({ title: 'Plan' })
      await expect(gateway.request('session.archive', { session_id: chat.session_id })).resolves.toMatchObject({
        archived: true
      })
      expect((await gateway.request<{ sessions: unknown[] }>('session.list', {})).sessions).toHaveLength(0)
      expect(
        (await gateway.request<{ sessions: Array<{ title: string }> }>('session.list', { include_hidden: true }))
          .sessions[0]?.title
      ).toBe('Plan')

      await expect(gateway.request('session.delete', { session_id: chat.session_id })).resolves.toEqual({
        deleted: chat.stored_session_id
      })
    })

    it('serves model options, access mode and files from the real routes', async () => {
      const server = await boot()
      await writeProjectFile(server.projectRoot, 'readme.md', 'x')
      const { gateway } = await connect(server)
      const chat = await gateway.request<Created>('session.create', {})

      const options = await gateway.request<{ providers: unknown[] }>('model.options', { session_id: chat.session_id })
      expect(options.providers.length).toBeGreaterThan(0)
      await expect(
        gateway.request('config.get', { key: 'approvals.mode', session_id: chat.session_id })
      ).resolves.toEqual({ value: 'manual' })
      await expect(
        gateway.request('complete.path', { session_id: chat.session_id, word: '@read' })
      ).resolves.toMatchObject({ items: [{ text: '@file:readme.md' }] })
    })
  }
)
