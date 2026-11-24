import { z } from 'zod'

import { type ScheduleEntry, scheduleToCronJob } from '@/app/vanta/adapters/schedule-jobs'
import type { AutomationBlueprint, CronDeliveryTarget, CronJob } from '@/types/desktop'

import { sessionRow, isoToSeconds } from './shim-session-row'
import { APPROVAL_TIMEOUT_MS, get, post, segment, type Send, type ShimCall, type ShimRoute, text } from './shim-core'

const TRIGGER_TIMEOUT_MS = 30 * 60 * 1000
const CRON_FIELDS = 5

const scheduleSchema = z.looseObject({
  cron: z.string(),
  id: z.number(),
  instruction: z.string(),
  lastRun: z.looseObject({ at: z.string(), ok: z.boolean(), summary: z.string().optional() }).optional(),
  mode: z.string().optional(),
  routine: z.string().optional(),
  script: z.string().optional(),
  status: z.enum(['active', 'paused'])
})

const runsSchema = z.object({
  runs: z.array(
    z.looseObject({ at: z.string(), jobId: z.number(), ok: z.boolean(), sessionId: z.string().optional(), summary: z.string(), trigger: z.string() })
  )
})

const blueprintsSchema = z.object({
  blueprints: z.array(
    z.object({
      description: z.string(),
      fields: z.array(z.object({ default: z.string().nullable(), key: z.string(), label: z.string() })),
      name: z.string()
    })
  )
})

const looksLikeCron = (value: string): boolean => value.trim().split(/\s+/).length === CRON_FIELDS

const whenOf = (schedule: string) => (looksLikeCron(schedule) ? { cron: schedule.trim() } : { when: schedule.trim() })

const humanize = (name: string): string => name.replace(/-/g, ' ').replace(/^\w/, char => char.toUpperCase())

function toJob(entry: z.infer<typeof scheduleSchema>): CronJob {
  const job = scheduleToCronJob(entry as ScheduleEntry)

  return {
    ...job,
    ...(entry.lastRun ? { last_error: entry.lastRun.ok ? null : (entry.lastRun.summary ?? 'failed'), last_run_at: entry.lastRun.at } : {})
  }
}

async function jobById(send: Send, id: string): Promise<CronJob> {
  const entries = z.array(scheduleSchema).parse(await get(send, '/api/schedules'))
  const found = entries.find(entry => String(entry.id) === id)

  if (!found) {
    throw new Error(`404: schedule #${id} not found`)
  }

  return toJob(found)
}

const numericId = (call: ShimCall): number => Number(segment(call))

async function updateJob(call: ShimCall): Promise<CronJob> {
  const updates = (call.body.updates ?? {}) as Record<string, unknown>
  const id = numericId(call)
  const prompt = typeof updates.prompt === 'string' ? updates.prompt : undefined
  const schedule = typeof updates.schedule === 'string' ? updates.schedule : undefined

  if (prompt !== undefined || schedule !== undefined) {
    await post(
      call.send,
      '/api/schedules/update',
      { id, ...(prompt === undefined ? {} : { instruction: prompt }), ...(schedule === undefined ? {} : whenOf(schedule)) },
      APPROVAL_TIMEOUT_MS
    )
  }

  if (updates.enabled === false) {
    await post(call.send, '/api/schedules/pause', { id })
  } else if (updates.enabled === true) {
    await post(call.send, '/api/schedules/resume', { id }, APPROVAL_TIMEOUT_MS)
  }

  return jobById(call.send, String(id))
}

const action = (path: string, timeoutMs?: number) => async (call: ShimCall) => {
  await post(call.send, path, { id: numericId(call) }, timeoutMs)

  return jobById(call.send, String(numericId(call)))
}

const JOB = '/api/cron/jobs/(\\d+)'

export const cronRoutes: readonly ShimRoute[] = [
  {
    handle: async ({ send }) => z.array(scheduleSchema).parse(await get(send, '/api/schedules')).map(toJob),
    method: 'GET',
    path: /^\/api\/cron\/jobs$/
  },
  {
    handle: async ({ body, send }) => {
      const created = z.looseObject({ schedule: scheduleSchema }).parse(
        await post(send, '/api/schedules/create', { instruction: text(body.prompt), ...whenOf(text(body.schedule)) })
      )

      return toJob(created.schedule)
    },
    method: 'POST',
    path: /^\/api\/cron\/jobs$/
  },
  { handle: call => jobById(call.send, segment(call)), method: 'GET', path: new RegExp(`^${JOB}$`) },
  { handle: updateJob, method: 'PUT', path: new RegExp(`^${JOB}$`) },
  { handle: action('/api/schedules/pause'), method: 'POST', path: new RegExp(`^${JOB}/pause$`) },
  { handle: action('/api/schedules/resume', APPROVAL_TIMEOUT_MS), method: 'POST', path: new RegExp(`^${JOB}/resume$`) },
  { handle: action('/api/schedules/trigger', TRIGGER_TIMEOUT_MS), method: 'POST', path: new RegExp(`^${JOB}/trigger$`) },
  {
    handle: async call => {
      await post(call.send, '/api/schedules/delete', { id: numericId(call) })

      return { ok: true }
    },
    method: 'DELETE',
    path: new RegExp(`^${JOB}$`)
  },
  {
    handle: async call => {
      const { runs } = runsSchema.parse(await get(call.send, `/api/schedules/${numericId(call)}/runs?limit=${call.query.get('limit') ?? 20}`))

      return {
        runs: runs.map(run =>
          sessionRow({
            id: run.sessionId ?? `run:${run.jobId}:${run.at}`,
            last_active: isoToSeconds(run.at),
            message_count: run.sessionId ? 2 : 0,
            preview: run.summary.slice(0, 200),
            source: 'cron',
            started_at: isoToSeconds(run.at),
            title: `${run.trigger === 'manual' ? 'Manual run' : 'Scheduled run'}${run.ok ? '' : ' (failed)'}`
          })
        )
      }
    },
    method: 'GET',
    path: new RegExp(`^${JOB}/runs$`)
  },
  {
    handle: async () =>
      ({ targets: [{ home_env_var: null, home_target_set: true, id: 'local', name: 'Local' }] }) satisfies { targets: CronDeliveryTarget[] },
    method: 'GET',
    path: /^\/api\/cron\/delivery-targets$/
  },
  {
    handle: async ({ send }) => {
      const { blueprints } = blueprintsSchema.parse(await get(send, '/api/schedules/blueprints'))

      return {
        blueprints: blueprints.map(
          (item): AutomationBlueprint => ({
            appUrl: '',
            category: 'Schedules',
            command: `vanta automation apply ${item.name}`,
            description: item.description,
            fields: item.fields.map(field => ({
              default: field.default,
              help: '',
              label: field.label,
              name: field.key,
              optional: field.default !== null,
              options: [],
              strict: false,
              type: 'text'
            })),
            key: item.name,
            source: 'builtin',
            tags: [],
            title: humanize(item.name)
          })
        )
      }
    },
    method: 'GET',
    path: /^\/api\/cron\/blueprints$/
  },
  {
    handle: async ({ body, send }) => {
      const made = z.looseObject({ scheduleId: z.number() }).parse(
        await post(send, '/api/schedules/blueprints/instantiate', { blueprint: text(body.blueprint), values: body.values ?? {} })
      )

      return jobById(send, String(made.scheduleId))
    },
    method: 'POST',
    path: /^\/api\/cron\/blueprints\/instantiate$/
  }
]
