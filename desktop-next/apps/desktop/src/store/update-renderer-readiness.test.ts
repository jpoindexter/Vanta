import { afterEach, describe, expect, it, vi } from 'vitest'
const flushAttachments = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('./draft-custody-registry', () => ({ flushUpdateAttachments: flushAttachments }))
import { $draftTextStorageUnavailable } from './draft-text-storage'
import { onUpdateDraftFlush } from './update-draft-flush'
import { startUpdateReadinessListener } from './update-renderer-readiness'

afterEach(() => { vi.restoreAllMocks(); flushAttachments.mockReset(); $draftTextStorageUnavailable.set(false); Reflect.deleteProperty(window, 'desktopBridge'); document.body.inert = false })
function fixture() {
  let prepare!: () => Promise<void>, release!: () => void
  window.desktopBridge = { updates: {
    onPrepare: (callback: () => Promise<void>) => { prepare = callback; return vi.fn() },
    onRelease: (callback: () => void) => { release = callback; return vi.fn() }
  } } as unknown as Window['desktopBridge']
  const stop = startUpdateReadinessListener()
  return { prepare: () => prepare(), release: () => release(), stop }
}
describe('renderer update readiness', () => {
  it('saves text before attachments and keeps input frozen until native release', async () => {
    const steps: string[] = [], off = onUpdateDraftFlush(() => { steps.push('text') })
    flushAttachments.mockImplementation(async () => { steps.push('attachments') })
    const s = fixture()
    try {
      await s.prepare(); expect(steps).toEqual(['text', 'attachments']); expect(document.body.inert).toBe(true)
      s.release(); expect(document.body.inert).toBe(false)
    } finally { off(); s.stop() }
  })
  it('refuses a caught text-storage failure and restores input', async () => {
    const off = onUpdateDraftFlush(() => { $draftTextStorageUnavailable.set(true) }), s = fixture()
    try { await expect(s.prepare()).rejects.toThrow('could not be saved'); expect(document.body.inert).toBe(false); expect(flushAttachments).not.toHaveBeenCalled() }
    finally { off(); s.stop() }
  })
  it('refuses unresolved attachments without clearing them', async () => {
    flushAttachments.mockRejectedValue(new Error('attachment pending')); const s = fixture()
    try { await expect(s.prepare()).rejects.toThrow('attachment pending'); expect(document.body.inert).toBe(false) }
    finally { s.stop() }
  })
})
