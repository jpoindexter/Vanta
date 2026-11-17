import { afterEach, describe, expect, it } from 'vitest'

import { $activeTreeGroup } from '@/components/pane-shell/tree/store'

import { resolveCurrentFindScope } from './find-in-page-scope'

function pane(id: string, hidden = false) {
  const group = document.createElement('section')
  group.dataset.treeGroup = id
  if (hidden) group.setAttribute('data-pane-hidden', '')
  group.innerHTML = `<div data-chat-surface data-composer-surface-id="${id}"><input aria-label="${id}"></div>`
  document.body.append(group)
  return { group, surface: group.firstElementChild, input: group.querySelector('input')! }
}

afterEach(() => {
  $activeTreeGroup.set(null)
  document.body.replaceChildren()
})

describe('Find pane ownership', () => {
  it('searches the focused second split instead of the first DOM surface', () => {
    pane('left')
    const right = pane('right')
    right.input.focus()
    expect(resolveCurrentFindScope()).toBe(right.surface)
  })

  it('uses the last interacted group when focus is in window chrome', () => {
    pane('left')
    const right = pane('right')
    $activeTreeGroup.set('right')
    expect(resolveCurrentFindScope()).toBe(right.surface)
  })

  it('routes a portaled composer by its existing surface identity, ahead of a stale group', () => {
    pane('left')
    const right = pane('right')
    const host = document.createElement('div')
    host.dataset.composerOwner = 'right'
    host.innerHTML = '<input aria-label="Floating draft">'
    document.body.append(host)
    $activeTreeGroup.set('left')
    host.querySelector('input')!.focus()
    expect(resolveCurrentFindScope()).toBe(right.surface)
  })

  it('never revives a hidden pane and retains the first-visible fallback', () => {
    const left = pane('left')
    const right = pane('right', true)
    $activeTreeGroup.set('right')
    right.input.focus()
    expect(resolveCurrentFindScope()).toBe(left.surface)
  })
})
