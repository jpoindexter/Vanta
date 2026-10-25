import { queryAllVisible } from '../pane-visibility'

const CONTROLS = '[data-vp="composer-input"],button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]'

function visible(element: HTMLElement) {
  return element.isConnected && !element.closest('[data-pane-hidden],[hidden],[inert]') && element.checkVisibility?.({ visibilityProperty: true }) !== false
}

function controls(root: ParentNode) {
  const candidates = queryAllVisible<HTMLElement>(CONTROLS, root).filter(visible)
  return candidates.find(element => element.matches('[data-vp="composer-input"]')) ?? candidates[0]
}

export function handoffAfterPaneClose(groupId: string | undefined, activeGroupId: string | null) {
  if (typeof document === 'undefined' || !groupId) return
  const zones = () => queryAllVisible<HTMLElement>('[data-tree-group]').filter(element => element.dataset.treeGroup === groupId && visible(element))
  const origin = document.activeElement
  if (!(origin instanceof HTMLElement) || !zones().length) return
  const ownsFocus = origin.closest<HTMLElement>('[data-tree-group]')?.dataset.treeGroup === groupId
  const menuIntent = activeGroupId === groupId && (origin === document.body || origin.closest('[role="menu"]'))
  if (!ownsFocus && !menuIntent) return

  requestAnimationFrame(() => {
    if (origin !== document.body && visible(origin)) return
    const current = document.activeElement
    if (current instanceof HTMLElement && current !== document.body && visible(current)) return
    const sameZone = zones().map(controls).find(Boolean)
    const chat = queryAllVisible<HTMLElement>('[data-chat-surface]').filter(visible).map(controls).find(Boolean)
    const target = sameZone ?? chat ?? controls(document)
    target?.focus({ preventScroll: true })
  })
}
