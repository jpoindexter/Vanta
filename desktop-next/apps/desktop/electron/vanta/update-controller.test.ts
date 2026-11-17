import { describe, expect, it, vi } from 'vitest'
import { createDesktopUpdater } from './update-controller'

const release = { version: '0.1.1', available: true, bytes: 3, sha256: 'a'.repeat(64), sourceCommit: 'b'.repeat(40), url: 'https://github.com/jpoindexter/Vanta/releases/download/desktop-v0.1.1/Vanta-0.1.1-arm64.zip' }
function setup() {
  const steps: string[] = []
  const deps = {
    version: '0.1.0', supported: true,
    discover: vi.fn(async () => release),
    approve: vi.fn(async () => { steps.push('approve'); return true }),
    download: vi.fn(async () => { steps.push('download'); return '/private/update.zip' }),
    prepare: vi.fn(async () => { steps.push('prepare'); return async () => { steps.push('release') } }),
    backup: vi.fn(async () => { steps.push('backup') }),
    install: vi.fn(async () => { steps.push('install') }),
    progress: vi.fn()
  }
  return { deps, steps, updater: createDesktopUpdater(deps) }
}
describe('native Desktop update admission', () => {
  it('requires fresh approval, verifies download before freezing, and retains rollback before native installation', async () => {
    const s = setup()
    expect(await s.updater.apply()).toMatchObject({ ok: true, handedOff: true })
    expect(s.steps).toEqual(['approve', 'download', 'prepare', 'backup', 'install'])
    expect(s.deps.progress).not.toHaveBeenCalledWith(expect.objectContaining({ stage: 'done' }))
  })
  it('does nothing on denial or when no newer release exists', async () => {
    const s = setup(); s.deps.approve.mockResolvedValue(false)
    expect(await s.updater.apply()).toMatchObject({ ok: false })
    expect(s.deps.download).not.toHaveBeenCalled()
    s.deps.discover.mockResolvedValue({ ...release, available: false })
    expect(await s.updater.apply()).toMatchObject({ ok: true, updateAvailable: false })
  })
  it('unfreezes on failed backup/install and never retries the native result', async () => {
    const s = setup(); s.deps.install.mockRejectedValue(new Error('publisher rejected'))
    expect(await s.updater.apply()).toMatchObject({ ok: false, error: 'publisher rejected', message: 'publisher rejected' })
    expect(s.steps.at(-1)).toBe('release')
    expect(s.deps.install).toHaveBeenCalledTimes(1)
  })
  it('does not stage when download or readiness fails', async () => {
    const s = setup(); s.deps.prepare.mockRejectedValue(new Error('work is running'))
    expect(await s.updater.apply()).toMatchObject({ ok: false, error: 'work is running' })
    expect(s.deps.backup).not.toHaveBeenCalled(); expect(s.deps.install).not.toHaveBeenCalled()
  })
  it('refuses overlapping applies before the first asynchronous check', async () => {
    const s = setup(); let resolve!: (value: typeof release) => void
    s.deps.discover.mockReturnValue(new Promise(r => { resolve = r }))
    const pending = s.updater.apply()
    expect(await s.updater.apply()).toMatchObject({ ok: false })
    resolve(release); await pending
    expect(s.deps.install).toHaveBeenCalledTimes(1)
  })
  it('does not unfreeze or reenter after an ambiguous native result', async () => {
    const s = setup(); s.deps.install.mockRejectedValue(Object.assign(new Error('native timeout'), { keepPrepared: true }))
    expect(await s.updater.apply()).toMatchObject({ ok: false })
    expect(s.steps).not.toContain('release')
    expect(await s.updater.apply()).toMatchObject({ ok: false, error: expect.stringContaining('no retry') })
    expect(s.deps.install).toHaveBeenCalledTimes(1)
  })
  it('refuses reentry when releasing preparation fails', async () => {
    const s = setup()
    s.deps.prepare.mockResolvedValue(async () => { throw new Error('lease release failed') })
    s.deps.backup.mockRejectedValue(new Error('backup failed'))
    expect(await s.updater.apply()).toMatchObject({ ok: false, error: expect.stringContaining('remains paused') })
    expect(await s.updater.apply()).toMatchObject({ ok: false, error: expect.stringContaining('no retry') })
    expect(s.deps.discover).toHaveBeenCalledTimes(1)
  })
  it('does not start a second update while native restart is handing off', async () => {
    const s = setup()
    expect(await s.updater.apply()).toMatchObject({ ok: true, handedOff: true })
    expect(await s.updater.apply()).toMatchObject({ ok: false, error: expect.stringContaining('no retry') })
    expect(s.deps.install).toHaveBeenCalledTimes(1)
  })
  it('refuses unsupported installations and maps check errors without a false current claim', async () => {
    const s = setup(); s.deps.discover.mockRejectedValue(new Error('offline'))
    expect(await s.updater.check()).toMatchObject({ error: 'offline', message: 'offline', updateAvailable: false })
    await expect(createDesktopUpdater({ ...s.deps, supported: false }).check()).resolves.toMatchObject({ supported: false })
  })
})
