import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { isStatusbarDetail, statusbarDetailItem } from './statusbar-presentation'

describe('quiet status bar', () => {
  it('moves routine diagnostics and duplicate shortcuts into Details', () => {
    for (const id of ['context-usage', 'session-timer', 'approval-mode', 'version-client', 'agents', 'cron']) {
      expect(isStatusbarDetail({ id })).toBe(true)
    }
  })
  it('keeps health, project, profile and unrecognized plugin controls visible', () => {
    for (const id of ['gateway-health', 'workspace-cwd', 'profile-switcher', 'plugin-custom']) {
      expect(isStatusbarDetail({ id })).toBe(false)
    }
  })
  it('keeps active or failed work and available updates visible', () => {
    for (const id of ['agents', 'version-client', 'version-backend', 'approval-mode']) {
      expect(isStatusbarDetail({ id, attention: true })).toBe(false)
    }
  })
  it('labels detail controls without autofocus tips or changing their handlers', () => {
    const onSelect = () => undefined
    const menuContent = 'existing menu'
    const result = statusbarDetailItem({ id: 'context-usage', title: 'Context usage', label: '200/1000', detail: '20%', toggleLabel: 'Context', onSelect, menuContent })
    expect(result).toMatchObject({ title: undefined, actionId: undefined, label: 'Context', onSelect, menuContent })
    expect(renderToStaticMarkup(createElement('div', null, result.detail))).toContain('200/1000 20%')
  })
})
