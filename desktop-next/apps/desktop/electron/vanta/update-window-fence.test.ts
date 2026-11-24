import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createUpdateWindowFence } from './update-window-fence'
import { CH } from './channels'
import type { IpcLike } from './native-handlers'

class Contents extends EventEmitter {
  destroyed = false
  sent: Array<{ channel: string; value: unknown }> = []
  constructor(readonly id: number) { super() }
  send(channel: string, value: unknown) {
    if (this.destroyed) throw new Error('webContents destroyed')
    this.sent.push({ channel, value })
  }
}
const window = (id: number) => ({ id, webContents: new Contents(id * 10) })
function fixture(count = 1) {
  const ipc = new EventEmitter(), windows = Array.from({ length: count }, (_, i) => window(i + 1))
  const fence = createUpdateWindowFence(ipc as unknown as IpcLike, () => windows)
  const lease = () => windows[0].webContents.sent.filter(row => row.channel === CH.updatePrepare).at(-1)!.value as string
  const ack = (sender: Contents, id = lease(), ok: unknown = true) => ipc.emit(CH.updatePrepared, { sender }, { lease: id, ok })
  return { ipc, windows, fence, lease, ack }
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

it('waits for every exact window acknowledgment and clears listeners/timers on cancellation', async () => {
  const h = fixture(2), pending = h.fence.prepare(), lease = h.lease()
  expect(() => h.fence.assertPrepared()).toThrow('changed')
  h.ack(h.windows[0].webContents)
  expect(() => h.fence.assertPrepared()).toThrow()
  h.ack(h.windows[1].webContents)
  expect(await pending).toBe(lease)
  expect(() => h.fence.assertPrepared()).not.toThrow()
  expect(vi.getTimerCount()).toBe(0)
  await h.fence.cancel(lease)
  expect(h.fence.active()).toBe(false)
  for (const w of h.windows) {
    expect(w.webContents.eventNames()).toEqual([])
    expect(w.webContents.sent.at(-1)).toEqual({ channel: CH.updateRelease, value: lease })
  }
})

it('ignores stale, malformed and wrong-sender replies without clearing the real window timeout', async () => {
  const h = fixture(), pending = h.fence.prepare(), lease = h.lease()
  h.ack(h.windows[0].webContents, 'stale')
  h.ack(new Contents(999), lease)
  h.ack(h.windows[0].webContents, lease, 'yes')
  h.ipc.emit(CH.updatePrepared, { sender: h.windows[0].webContents }, null)
  await Promise.resolve()
  expect(() => h.fence.assertPrepared()).toThrow()
  expect(vi.getTimerCount()).toBe(1)
  h.ack(h.windows[0].webContents, lease)
  expect(await pending).toBe(lease)
})

it('ignores a late previous-generation acknowledgment during a new preparation', async () => {
  const h = fixture(), first = h.fence.prepare(), oldLease = h.lease()
  h.ack(h.windows[0].webContents)
  await first; await h.fence.cancel(oldLease)
  const second = h.fence.prepare(), current = h.lease()
  expect(current).not.toBe(oldLease)
  h.ack(h.windows[0].webContents, oldLease)
  expect(() => h.fence.assertPrepared()).toThrow()
  h.ack(h.windows[0].webContents, current)
  expect(await second).toBe(current)
  await h.fence.cancel(current)
  h.ack(h.windows[0].webContents, current)
  expect(h.fence.active()).toBe(false)
})

it.each(['did-start-navigation', 'render-process-gone', 'destroyed'])('invalidates a same-ID window generation on %s even after it acknowledged', async event => {
  const h = fixture(), pending = h.fence.prepare()
  h.ack(h.windows[0].webContents)
  await pending
  h.windows[0].webContents.emit(event)
  expect(() => h.fence.assertPrepared()).toThrow('changed or reloaded')
  await h.fence.cancel(h.lease())
})

it('refuses a new window that was not part of the flushed snapshot', async () => {
  const h = fixture(), pending = h.fence.prepare()
  h.ack(h.windows[0].webContents); await pending
  h.windows.push(window(2))
  expect(() => h.fence.assertPrepared()).toThrow('changed or reloaded')
  await h.fence.cancel(h.lease())
})

it('refuses a destroyed window whose send cannot reach the renderer', async () => {
  const h = fixture(); h.windows[0].webContents.destroyed = true
  await expect(h.fence.prepare()).rejects.toThrow('closed before')
  expect(h.fence.active()).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
})

it('refuses an unresponsive renderer that never acknowledges and cleans all outstanding timers', async () => {
  const h = fixture(2), pending = h.fence.prepare()
  const rejected = expect(pending).rejects.toThrow('did not confirm')
  h.ack(h.windows[0].webContents)
  h.windows[1].webContents.emit('unresponsive')
  await vi.advanceTimersByTimeAsync(10_000)
  await rejected
  expect(h.fence.active()).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
  expect(h.windows.every(w => w.webContents.eventNames().length === 0)).toBe(true)
})

it('rejects a negative acknowledgment and cancels the other windows outstanding deadlines', async () => {
  const h = fixture(3), pending = h.fence.prepare()
  const rejected = expect(pending).rejects.toThrow('could not save')
  h.ack(h.windows[0].webContents, h.lease(), false)
  await rejected
  expect(vi.getTimerCount()).toBe(0)
  expect(h.windows.every(w => w.webContents.sent.at(-1)?.channel === CH.updateRelease)).toBe(true)
})

it('explicit cancellation settles outstanding acknowledgments and removes their timeout callbacks', async () => {
  const h = fixture(2), pending = h.fence.prepare().catch(error => error)
  expect(vi.getTimerCount()).toBe(2)
  await h.fence.cancel(h.lease())
  expect(await pending).toBeInstanceOf(Error)
  expect(vi.getTimerCount()).toBe(0)
  expect(h.fence.active()).toBe(false)
  expect(h.windows.every(w => w.webContents.eventNames().length === 0)).toBe(true)
})

it('does not let a wrong cancellation lease release the current preparation', async () => {
  const h = fixture(), pending = h.fence.prepare()
  await expect(h.fence.cancel('stale')).rejects.toThrow('original')
  expect(h.fence.active()).toBe(true)
  h.ack(h.windows[0].webContents); await pending
  await h.fence.cancel(h.lease())
})

it('refuses an empty window set instead of assuming draft durability', async () => {
  const h = fixture(0)
  await expect(h.fence.prepare()).rejects.toThrow('Open Vanta')
  expect(h.fence.active()).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
})
