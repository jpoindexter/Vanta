import { describe, expect, it } from 'vitest'

import { isHiddenBundledPlugin, isHiddenMemorySubpage, isHiddenModelSubpage, SHOW_KANBAN, SHOW_VAULT, SHOW_WEBHOOKS } from './settings-extras'
import { OTHER_SUBPAGES } from './other-subpages'

describe('Vanta surfaces Vanta has no backend for stay out of the app', () => {
  it('keeps the flags off', () => {
    expect([SHOW_KANBAN, SHOW_VAULT, SHOW_WEBHOOKS]).toEqual([false, false, false])
    expect(Object.keys(OTHER_SUBPAGES)).not.toContain('vault')
  })

  it('hides the Kanban bundled plugin and nothing else', () => {
    expect(isHiddenBundledPlugin('kanban')).toBe(true)
    expect(isHiddenBundledPlugin('vanta-bots')).toBe(false)
  })

  it('still hides the auxiliary and mixture-of-agents settings pages', () => {
    expect(isHiddenModelSubpage('moa')).toBe(true)
    expect(isHiddenModelSubpage('model')).toBe(false)
  })

  it('hides the empty Context & compression page but keeps Persistent memory', () => {
    expect(isHiddenMemorySubpage('context')).toBe(true)
    expect(isHiddenMemorySubpage('persistent')).toBe(false)
  })
})
