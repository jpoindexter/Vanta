import { coarseElapsed } from '@/lib/time'

export interface AgeLabels {
  ageDay: string
  ageHour: string
  ageMin: string
  ageNow: string
}

const SUFFIX = { day: 'ageDay', hour: 'ageHour', minute: 'ageMin' } as const

/** Compact relative time for a row: "now", "2m", "1h", "3d". Never a seconds tick. */
export function formatRowAge(epochSeconds: number, labels: AgeLabels, nowMs = Date.now()): string {
  const { unit, value } = coarseElapsed(nowMs - epochSeconds * 1000)

  return unit === 'second' ? labels.ageNow : `${value}${labels[SUFFIX[unit]]}`
}
