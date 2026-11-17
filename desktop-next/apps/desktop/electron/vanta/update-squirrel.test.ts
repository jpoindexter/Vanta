import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installWithSquirrel } from './update-squirrel'
import { createHash } from 'node:crypto'

afterEach(() => vi.useRealTimers())
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vanta-native-update-'))
  const zip = path.join(root, 'update.zip'); await fs.writeFile(zip, 'zip')
  const events = new EventEmitter()
  const native = Object.assign(events, { getFeedURL: vi.fn(() => ''), setFeedURL: vi.fn(), checkForUpdates: vi.fn(), quitAndInstall: vi.fn() })
  const stopRuntime = vi.fn(async () => {})
  return { root, native, stopRuntime, options: { updater: native, zip, release: { version: '0.1.1', available: true, bytes: 3, sha256: createHash('sha256').update('zip').digest('hex') }, stopRuntime } }
}
describe('Squirrel native handoff', () => {
  it('waits for native signature acceptance, then stops only the idle app runtime before install', async () => {
    const s = await fixture()
    s.native.checkForUpdates.mockImplementation(() => queueMicrotask(() => s.native.emit('update-downloaded')))
    try {
      await installWithSquirrel(s.options)
      expect(s.stopRuntime).toHaveBeenCalledOnce(); expect(s.native.quitAndInstall).toHaveBeenCalledOnce()
      expect(s.stopRuntime.mock.invocationCallOrder[0]).toBeLessThan(s.native.quitAndInstall.mock.invocationCallOrder[0]!)
      expect(s.native.listenerCount('update-downloaded')).toBe(0)
    } finally { await fs.rm(s.root, { recursive: true, force: true }) }
  })
  it('refuses provider rejection without stopping or retrying', async () => {
    const s = await fixture()
    s.native.checkForUpdates.mockImplementation(() => queueMicrotask(() => s.native.emit('error', new Error('signature rejected'))))
    try {
      await expect(installWithSquirrel(s.options)).rejects.toThrow('signature rejected')
      expect(s.stopRuntime).not.toHaveBeenCalled(); expect(s.native.quitAndInstall).not.toHaveBeenCalled()
      expect(s.native.checkForUpdates).toHaveBeenCalledOnce()
    } finally { await fs.rm(s.root, { recursive: true, force: true }) }
  })
  it('keeps preparation fenced if native staging succeeded but runtime shutdown failed', async () => {
    const s = await fixture(); s.stopRuntime.mockRejectedValue(new Error('shutdown failed'))
    s.native.checkForUpdates.mockImplementation(() => queueMicrotask(() => s.native.emit('update-downloaded')))
    try {
      await expect(installWithSquirrel(s.options)).rejects.toMatchObject({ keepPrepared: true })
      expect(s.native.quitAndInstall).not.toHaveBeenCalled()
    } finally { await fs.rm(s.root, { recursive: true, force: true }) }
  })
})
