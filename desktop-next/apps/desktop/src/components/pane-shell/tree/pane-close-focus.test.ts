import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { group, split } from './model'
import { $layoutTree, closeToolPane, closeTreePane, noteActiveTreeGroup, registerPaneCloser } from './store'

const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

function mount() {
  document.body.innerHTML = '<section data-chat-surface data-tree-group="main"><textarea data-vp="composer-input">Unsent draft</textarea></section><section data-tree-group="preview"><button>Edit document</button></section>'
  const pane = document.querySelector<HTMLElement>('[data-tree-group="preview"]')!
  const edit = pane.querySelector('button')!
  const draft = document.querySelector('textarea')!
  $layoutTree.set(split('row', [group(['workspace'], { id: 'main' }), group(['preview'], { id: 'preview' })]))
  noteActiveTreeGroup('preview')
  registerPaneCloser('preview', () => pane.remove())
  edit.focus()
  return { draft, edit, pane }
}

beforeEach(() => { document.body.replaceChildren() })
afterEach(() => {
  registerPaneCloser('preview')
  document.body.replaceChildren()
  $layoutTree.set(null)
  noteActiveTreeGroup(null)
})

describe('focus after closing a pane', () => {
  it('hands a removed pane focus to the visible chat without changing its draft', async () => {
    const { draft } = mount()
    closeTreePane('preview')
    await nextFrame()
    expect(document.activeElement).toBe(draft)
    expect(draft.value).toBe('Unsent draft')
  })

  it('prefers the surviving control in the same zone', async () => {
    const { edit, pane } = mount()
    const sibling = document.createElement('input')
    pane.append(sibling)
    registerPaneCloser('preview', () => edit.remove())
    closeTreePane('preview')
    await nextFrame()
    expect(document.activeElement).toBe(sibling)
  })

  it('does not steal focus when a background pane closes', async () => {
    const { draft } = mount()
    draft.focus()
    closeTreePane('preview')
    await nextFrame()
    expect(document.activeElement).toBe(draft)
  })

  it('respects a newer focus choice before the handoff frame', async () => {
    mount()
    const search = document.createElement('input')
    document.body.append(search)
    closeTreePane('preview')
    search.focus()
    await nextFrame()
    expect(document.activeElement).toBe(search)
  })

  it('keeps focus when the closer leaves the pane open', async () => {
    const { edit } = mount()
    registerPaneCloser('preview', () => undefined)
    closeTreePane('preview')
    await nextFrame()
    expect(document.activeElement).toBe(edit)
  })

  it('also hands off after the tool-panel close path', async () => {
    const { draft } = mount()
    closeToolPane('preview')
    await nextFrame()
    expect(document.activeElement).toBe(draft)
  })

  it('ignores controls in hidden or inert surviving panes', async () => {
    const { draft, pane } = mount()
    pane.insertAdjacentHTML('beforeend', '<div data-pane-hidden><input></div><div inert><input></div>')
    registerPaneCloser('preview', () => pane.querySelector('button')!.remove())
    closeTreePane('preview')
    await nextFrame()
    expect(document.activeElement).toBe(draft)
  })

  it('leaves an open Find field outside the closing zone alone', async () => {
    mount()
    const find = document.createElement('input')
    document.body.append(find)
    find.focus()
    closeTreePane('preview')
    await nextFrame()
    expect(document.activeElement).toBe(find)
  })

  it('hands off when the active zone menu closes with its pane', async () => {
    const { draft, pane } = mount()
    const menu = document.createElement('button')
    menu.setAttribute('role', 'menu')
    document.body.append(menu)
    menu.focus()
    registerPaneCloser('preview', () => { pane.remove(); menu.remove() })
    closeTreePane('preview')
    await nextFrame()
    expect(document.activeElement).toBe(draft)
  })
})
