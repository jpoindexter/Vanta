import { describe, expect, it } from 'vitest'

import { isHiddenBundledPlugin, isHiddenModelSubpage, SHOW_KANBAN, SHOW_WEBHOOKS } from './hermes-extras'

describe('Hermes surfaces Vanta has no backend for stay out of the app', () => {
  it('keeps the flags off', () => {
    expect([SHOW_KANBAN, SHOW_WEBHOOKS]).toEqual([false, false])
  })

  it('hides the Kanban bundled plugin and nothing else', () => {
    expect(isHiddenBundledPlugin('kanban')).toBe(true)
    expect(isHiddenBundledPlugin('hermes-bots')).toBe(false)
  })

  it('still hides the auxiliary and mixture-of-agents settings pages', () => {
    expect(isHiddenModelSubpage('moa')).toBe(true)
    expect(isHiddenModelSubpage('model')).toBe(false)
  })
})
