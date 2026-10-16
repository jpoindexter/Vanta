import { z } from 'zod'

/** The dimensions Vanta asks about when it fits a step to the person: each is "unknown" until they say. */
export const CAPACITY_DIMENSIONS = ['cognitive', 'attentional', 'sensory', 'social', 'emotional', 'physical', 'time'] as const

const itemSchema = z.looseObject({
  id: z.string(),
  outcome: z.string(),
  preparedAction: z.looseObject({ preview: z.string() }),
  recommendation: z.string(),
  state: z.string(),
  timeCapacityFit: z.looseObject({ minutes: z.number() })
})

const snapshotSchema = z.looseObject({
  inbox: z.array(z.unknown()).default([]),
  reentry: z.looseObject({ action: z.string() }).optional(),
  support: z.looseObject({
    capacity: z.record(z.string(), z.string()),
    refusal: z.looseObject({ active: z.boolean(), scope: z.string().optional() })
  }),
  today: z.array(itemSchema)
})

export type TodayItem = z.infer<typeof itemSchema>
export type TodaySnapshot = z.infer<typeof snapshotSchema>
export type OffScope = 'global' | 'pattern' | 'session'
export type TodayAction = 'do_it' | 'show_me' | 'skip' | 'snooze'

/** The server may answer a change with `{snapshot}` or with the snapshot itself. */
export function parseSnapshot(value: unknown): null | TodaySnapshot {
  const inner = value && typeof value === 'object' && 'snapshot' in value ? (value as { snapshot: unknown }).snapshot : value
  const parsed = snapshotSchema.safeParse(inner)

  return parsed.success ? parsed.data : null
}

/** "needs human" -> "Needs human". */
export const stateLabel = (state: string): string =>
  state
    .split(' ')
    .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')

export const SNOOZE_MS = 60 * 60 * 1000
