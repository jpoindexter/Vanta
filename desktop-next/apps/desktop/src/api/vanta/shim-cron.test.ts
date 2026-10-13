import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createCronJob,
  deleteCronJob,
  getAutomationBlueprints,
  getCronJobRuns,
  getCronJobs,
  instantiateAutomationBlueprint,
  pauseCronJob,
  resumeCronJob,
  triggerCronJob,
  updateCronJob
} from '@/api/cron'
import type { HermesApiRequest } from '@/global'
import { installRestBridge } from '@/test/rest-bridge'

const entry = (patch: Record<string, unknown> = {}) => ({
  cron: '0 9 * * *',
  id: 3,
  instruction: 'summarise inbox',
  status: 'active',
  ...patch
})

/** A stand-in Vanta server: answers the schedule routes the way the real ones do. */
function fakeServer() {
  const calls: HermesApiRequest[] = []
  let current = entry()

  const answer = (request: HermesApiRequest): object => {
    calls.push(request)
    const body = (request.body ?? {}) as Record<string, unknown>

    switch (request.path.split('?')[0]) {
      case '/api/schedules':
        return [current]
      case '/api/schedules/create':
        current = entry({ cron: (body.cron as string) ?? '0 */2 * * *', instruction: body.instruction })

        return { ok: true, schedule: current }
      case '/api/schedules/pause':
        current = entry({ ...current, status: 'paused' })

        return { ok: true }
      case '/api/schedules/resume':
        current = entry({ ...current, status: 'active' })

        return { ok: true }
      case '/api/schedules/3/runs':
        return { runs: [{ at: '2026-10-13T09:00:00Z', jobId: 3, ok: false, sessionId: 'sched-3-1', summary: 'error: down', trigger: 'manual' }] }
      case '/api/schedules/blueprints':
        return { blueprints: [{ description: 'Daily', fields: [{ default: '0 8 * * *', key: 'cron', label: 'When' }, { default: null, key: 'topic', label: 'Topic' }], name: 'daily-brief' }] }
      case '/api/schedules/blueprints/instantiate':
        return { ok: true, scheduleId: 3 }
      default:
        return { ok: true }
    }
  }

  return { answer, calls, setCurrent: (value: ReturnType<typeof entry>) => (current = value) }
}

describe('schedule controls reach the Vanta routes', () => {
  let server: ReturnType<typeof fakeServer>

  beforeEach(() => {
    server = fakeServer()
    installRestBridge(server.answer)
    ;(window as { vantaDesktop?: unknown }).vantaDesktop = {}
  })

  afterEach(() => {
    delete (window as { hermesDesktop?: unknown }).hermesDesktop
    delete (window as { vantaDesktop?: unknown }).vantaDesktop
  })

  const paths = () => server.calls.map(call => call.path.split('?')[0])

  it('lists schedules as cron jobs including the last run result', async () => {
    server.setCurrent(entry({ lastRun: { at: '2026-10-13T09:00:00Z', ok: false, summary: 'error: down' } }))
    const [job] = await getCronJobs()

    expect(job).toMatchObject({ enabled: true, id: '3', last_error: 'error: down', last_run_at: '2026-10-13T09:00:00Z' })
  })

  it('creates a job from a cron string and from a natural phrase', async () => {
    const job = await createCronJob({ prompt: 'hello', schedule: '0 7 * * 1' })

    expect(job.id).toBe('3')
    await createCronJob({ prompt: 'hello', schedule: 'every 2 hours' })

    const creates = server.calls.filter(call => call.path === '/api/schedules/create')

    expect(creates.map(call => call.body)).toEqual([
      { cron: '0 7 * * 1', instruction: 'hello' },
      { instruction: 'hello', when: 'every 2 hours' }
    ])
  })

  it('pauses, resumes, edits and deletes through the schedule routes', async () => {
    expect((await pauseCronJob('3')).state).toBe('paused')
    expect((await resumeCronJob('3')).state).toBe('scheduled')
    await updateCronJob('3', { enabled: false, prompt: 'new', schedule: '0 5 * * *' })
    await deleteCronJob('3')

    expect(server.calls.filter(call => call.method === 'POST').map(call => [call.path, call.body])).toEqual([
      ['/api/schedules/pause', { id: 3 }],
      ['/api/schedules/resume', { id: 3 }],
      ['/api/schedules/update', { cron: '0 5 * * *', id: 3, instruction: 'new' }],
      ['/api/schedules/pause', { id: 3 }],
      ['/api/schedules/delete', { id: 3 }]
    ])
  })

  it('triggers with a long timeout and lists runs as openable session rows', async () => {
    await triggerCronJob('3')
    expect(server.calls.find(call => call.path === '/api/schedules/trigger')?.timeoutMs).toBeGreaterThan(60_000)

    const runs = await getCronJobRuns('3', 5)

    expect(paths()).toContain('/api/schedules/3/runs')
    expect(runs[0]).toMatchObject({ id: 'sched-3-1', message_count: 2, source: 'cron', title: 'Manual run (failed)' })
  })

  it('offers schedule blueprints as form fields and instantiates one', async () => {
    const { blueprints } = await getAutomationBlueprints('default')

    expect(blueprints[0]).toMatchObject({ key: 'daily-brief', title: 'Daily brief' })
    expect(blueprints[0]?.fields.map(field => [field.name, field.optional])).toEqual([['cron', true], ['topic', false]])

    const job = await instantiateAutomationBlueprint({ blueprint: 'daily-brief', values: { topic: 'AI' } }, 'default')

    expect(job.id).toBe('3')
    expect(server.calls.find(call => call.path === '/api/schedules/blueprints/instantiate')?.body).toEqual({
      blueprint: 'daily-brief',
      values: { topic: 'AI' }
    })
  })
})
