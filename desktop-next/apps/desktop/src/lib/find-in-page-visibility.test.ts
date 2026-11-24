import { afterEach, describe, expect, it } from 'vitest'

import { performScopedFind, releaseFindScope } from './find-in-page-scope'

afterEach(() => {
  releaseFindScope()
  document.body.replaceChildren()
})

function surface(html: string) {
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.append(root)
  // jsdom has no layout/checkVisibility; Electron supplies the real predicate.
  for (const el of root.querySelectorAll('*')) {
    el.checkVisibility = options => {
      expect(options?.visibilityProperty).toBe(true)
      return !el.closest('[hidden]') && getComputedStyle(el).display !== 'contents'
    }
  }
  return root
}

describe('Find visible matches', () => {
  it('excludes hidden header duplicates on search and on subsequent steps', () => {
    const root = surface('<header hidden><span>amber amber amber</span></header><p>amber amber amber</p>')
    expect(performScopedFind(root, 'amber', { forward: true, findNext: false })).toEqual({ count: 3, activeOrdinal: 1 })
    expect(root.querySelectorAll('header mark')).toHaveLength(0)
    expect(performScopedFind(root, 'amber', { forward: true, findNext: true })).toEqual({ count: 3, activeOrdinal: 2 })
    expect(root.querySelector('[data-find-active]')?.closest('p')).not.toBeNull()
  })

  it('still descends into display:contents containers with visible children', () => {
    const root = surface('<div style="display:contents"><span>amber</span></div>')
    expect(performScopedFind(root, 'amber', { forward: true, findNext: false })).toEqual({ count: 1, activeOrdinal: 1 })
  })
})
