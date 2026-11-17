import { randomUUID } from 'node:crypto'
import { CH } from './channels'
import type { IpcLike } from './native-handlers'

interface UpdateWindow { id: number; webContents: {
  id: number
  send: (channel: string, value: unknown) => void
  on: (event: string, callback: (...args: unknown[]) => void) => unknown
  removeListener: (event: string, callback: (...args: unknown[]) => void) => unknown
} }
interface Pending { lease: string; windows: UpdateWindow[]; replies: Map<number, (ok: boolean) => void>; changed: boolean; detach: (() => void)[] }

/** Missing/destroyed/unresponsive windows block restart rather than implying their drafts were saved. */
export function createUpdateWindowFence(ipc: IpcLike, windows: () => UpdateWindow[]) {
  let pending: Pending | null = null
  ipc.on(CH.updatePrepared, (event, raw: unknown) => {
    if (!pending || !raw || typeof raw !== 'object') return
    const value = raw as { lease?: unknown; ok?: unknown }, sender = event.sender as { id: number }
    if (value.lease === pending.lease && typeof value.ok === 'boolean') pending.replies.get(sender.id)?.(value.ok)
  })
  const cancel = async (lease: string) => {
    if (!pending || pending.lease !== lease) throw new Error('The original update window lease is required.')
    const captured = pending; pending = null
    captured.detach.forEach(off => off())
    for (const settle of captured.replies.values()) settle(false)
    for (const window of captured.windows) {
      try { window.webContents.send(CH.updateRelease, captured.lease) } catch { /* Closed windows hold no live editor. */ }
    }
  }
  const prepare = async () => {
    if (pending) throw new Error('Another window preparation is in progress.')
    const state: Pending = { lease: randomUUID(), windows: [...windows()], replies: new Map(), changed: false, detach: [] }
    if (!state.windows.length) throw new Error('Open Vanta before installing its update.')
    pending = state
    for (const window of state.windows) {
      const invalidate = () => { state.changed = true }
      for (const name of ['did-start-navigation', 'render-process-gone', 'destroyed']) {
        window.webContents.on(name, invalidate)
        state.detach.push(() => { window.webContents.removeListener(name, invalidate) })
      }
    }
    try {
      await Promise.all(state.windows.map(window => new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { state.replies.delete(window.webContents.id); reject(new Error('A window did not confirm saved drafts. Keep Vanta open and retry when ready.')) }, 10_000)
        state.replies.set(window.webContents.id, ok => {
          clearTimeout(timer); state.replies.delete(window.webContents.id)
          ok ? resolve() : reject(new Error('A window could not save its drafts or attachments. Keep it open and resolve that before updating.'))
        })
        try { window.webContents.send(CH.updatePrepare, state.lease) }
        catch { clearTimeout(timer); state.replies.delete(window.webContents.id); reject(new Error('A window closed before its draft could be saved.')) }
      })))
      return state.lease
    } catch (error) { await cancel(state.lease); throw error }
  }
  const assertPrepared = () => {
    const current = windows().map(w => w.id).sort(), captured = pending?.windows.map(w => w.id).sort()
    if (!pending || pending.changed || pending.replies.size || JSON.stringify(current) !== JSON.stringify(captured)) throw new Error('A window changed or reloaded during update preparation. Restart was refused to protect its draft.')
  }
  return { prepare, cancel, assertPrepared, active: () => pending !== null }
}
