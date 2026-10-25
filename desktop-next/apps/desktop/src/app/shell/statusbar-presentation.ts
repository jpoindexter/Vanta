import { createElement, Fragment } from 'react'

import type { StatusbarItem } from './statusbar-controls'

const DETAILS = new Set([
  'agents', 'cron', 'webhooks', 'context-usage', 'cache-hit-rate',
  'tokens-per-second', 'session-timer', 'system-resources', 'approval-mode',
  'terminal', 'version-client', 'version-backend'
])

/** Unknown plugin entries remain visible; activity and updates never move into Details. */
export function isStatusbarDetail(item: StatusbarItem): boolean {
  return DETAILS.has(item.id) && !item.attention
}

/** Visible labels replace tips here: autofocus tips otherwise compete with nested menu dismissal. */
export function statusbarDetailItem(item: StatusbarItem): StatusbarItem {
  return {
    ...item,
    title: undefined,
    actionId: undefined,
    label: item.toggleLabel ?? item.label,
    detail: item.label === item.toggleLabel ? item.detail : createElement(Fragment, null, item.label, ' ', item.detail)
  }
}
