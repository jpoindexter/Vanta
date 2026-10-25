import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { findGroup, group, split } from '@/components/pane-shell/tree/model'
import { $hiddenTreePanes, $layoutTree, setStripTabHidden } from '@/components/pane-shell/tree/store'
import { $workspaceMode, $workspaceOwnerKey, setWorkspaceScope } from '@/components/pane-shell/workspace-scope'

import {
  $panesFlipped,
  $sidebarOpen,
  requestSessionSearchFocus,
  SESSION_SEARCH_FOCUS_EVENT,
  setSidebarOpen
} from './layout'

beforeEach(() => {
  vi.useFakeTimers()
  $hiddenTreePanes.set(new Set())
  $panesFlipped.set(false)
  setWorkspaceScope('bots', 'test-bot-owner')
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  $layoutTree.set(null)
  $hiddenTreePanes.set(new Set())
  setStripTabHidden('sessions', false)
  $panesFlipped.set(false)
  setWorkspaceScope('sessions')
})

describe('chat search targets the history pane', () => {
  it.each([false, true])('fronts history before requesting focus without changing the chat owner (flipped=%s)', flipped => {
    $panesFlipped.set(flipped)
    const sidebar = group(['sessions', 'bots'], { active: 'bots', id: 'sidebar', minimized: true })
    const main = group(['workspace'], { id: 'main' })
    const files = group(['files'], { id: 'files', minimized: true })
    $layoutTree.set(split('row', flipped ? [files, main, sidebar] : [sidebar, main, files]))
    setStripTabHidden('sessions', true)
    setSidebarOpen(false)
    const snapshots: Array<string | undefined> = []
    const listener = () => snapshots.push(findGroup($layoutTree.get()!, 'sidebar')?.active)
    window.addEventListener(SESSION_SEARCH_FOCUS_EVENT, listener)
    try {
      requestSessionSearchFocus()
      expect($sidebarOpen.get()).toBe(true)
      expect(findGroup($layoutTree.get()!, 'sidebar')).toMatchObject({ active: 'sessions', minimized: false })
      expect(findGroup($layoutTree.get()!, 'files')?.minimized).toBe(true)
      expect($hiddenTreePanes.get().has('sessions')).toBe(false)
      expect([$workspaceMode.get(), $workspaceOwnerKey.get()]).toEqual(['bots', 'test-bot-owner'])
      expect(snapshots).toEqual([])
      vi.runAllTimers()
      expect(snapshots).toEqual(['sessions'])
    } finally {
      window.removeEventListener(SESSION_SEARCH_FOCUS_EVENT, listener)
    }
  })

  it('keeps the same tree when history is already visible', () => {
    $layoutTree.set(split('row', [group(['sessions', 'bots'], { active: 'sessions' }), group(['workspace'])]))
    setSidebarOpen(true)
    const tree = $layoutTree.get()
    requestSessionSearchFocus()
    expect($layoutTree.get()).toBe(tree)
  })
})
