import type { CostBasis } from '@/api/vanta-company-schemas'

import { NOT_REPORTED } from './copy'

const SECOND_MS = 1000
const MINUTE_S = 60
const HOUR_S = 3600
const DAY_S = 86_400
const WEEK_DAYS = 7

const money = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: 'currency'
})

export function formatUsd(amount: number): string {
  return amount > 0 && amount < 0.01 ? '<$0.01' : money.format(amount)
}

export interface CostText {
  /** Dollar figure, or null when nothing was reported. Never "$0.00" for an unknown cost. */
  amount: null | string
  /** The label that always rides with the figure. */
  basis: 'Estimated' | 'Not reported' | 'Reported' | 'Reported by the CLI'
}

const BASIS_WORD: Record<CostBasis, CostText['basis']> = {
  estimated: 'Estimated',
  'not-reported': NOT_REPORTED,
  reported: 'Reported'
}

/**
 * A cost with its basis. An unknown cost is "Not reported", never zero. A dollar figure that an
 * external CLI reported is labelled so: on a subscription it is notional, not a charge.
 */
export function costText(usd: null | number, basis: CostBasis | null, viaCli = false): CostText {
  if (basis === null || basis === 'not-reported' || usd === null) {
    return { amount: null, basis: NOT_REPORTED }
  }

  return { amount: formatUsd(usd), basis: viaCli && basis === 'reported' ? 'Reported by the CLI' : BASIS_WORD[basis] }
}

export const NATIVE_RUNTIME = 'vanta-native'

const RUNTIME_NAME: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  'custom-cli': 'Custom CLI',
  hermes: 'Hermes',
  'vanta-native': 'Vanta native'
}

/** Display name of a runtime id or kind ("claude-code" as "Claude Code"); unknown ids pass through. */
export const runtimeName = (id: string): string => RUNTIME_NAME[id] ?? id

/** "5 min ago" style label; falls back to a short date for anything older than a week. */
export function relativeTime(iso: null | string, now: number): string {
  const then = iso ? Date.parse(iso) : Number.NaN

  if (Number.isNaN(then)) {
    return ''
  }

  const seconds = Math.max(0, Math.round((now - then) / SECOND_MS))

  if (seconds < MINUTE_S) {
    return 'just now'
  }

  if (seconds < HOUR_S) {
    return `${Math.floor(seconds / MINUTE_S)} min ago`
  }

  if (seconds < DAY_S) {
    return `${Math.floor(seconds / HOUR_S)} h ago`
  }

  const days = Math.floor(seconds / DAY_S)

  return days < WEEK_DAYS
    ? `${days} d ago`
    : new Date(then).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}

export function clockTime(iso: string): string {
  const date = new Date(iso)

  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('en-US', { day: 'numeric', hour: '2-digit', minute: '2-digit', month: 'short' })
}

/** Whole seconds between two ISO times as "1m 5s"; empty while the end is unknown. */
export function durationText(startIso: string, endIso: null | string): string {
  const start = Date.parse(startIso)
  const end = endIso ? Date.parse(endIso) : Number.NaN

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return ''
  }

  const total = Math.max(0, Math.round((end - start) / SECOND_MS))

  return total < MINUTE_S ? `${total}s` : `${Math.floor(total / MINUTE_S)}m ${total % MINUTE_S}s`
}

export function percent(fraction: number): string {
  return `${Math.round(Math.min(Math.max(fraction, 0), 1) * 100)}%`
}

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/** A plain number for a key result: 1,200 and 0.25, never 1200.00. */
export const formatNumber = (value: number): string => number.format(value)
