import { beforeEach, describe, expect, it, vi } from 'vitest'

const captureLook = vi.fn()
const requestComposerAttachImages = vi.fn()
const notifyError = vi.fn()

vi.mock('@/api/look', () => ({ captureLook: (mode: string) => captureLook(mode) }))
vi.mock('@/app/chat/composer/focus', () => ({
  requestComposerAttachImages: (blobs: Blob[]) => requestComposerAttachImages(blobs)
}))
vi.mock('@/store/notifications', () => ({ notifyError: (...args: unknown[]) => notifyError(...args) }))

import { captureIntoComposer, imageToBlob, lookErrorMessage } from './use-look-capture'

// 1x1 transparent PNG
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

beforeEach(() => {
  captureLook.mockReset()
  requestComposerAttachImages.mockReset()
  notifyError.mockReset()
})

describe('lookErrorMessage', () => {
  it('keeps only the recovery text after the status code', () => {
    expect(lookErrorMessage(new Error('403: Allow Vanta in System Settings > Screen Recording, then retry.'))).toBe(
      'Allow Vanta in System Settings > Screen Recording, then retry.'
    )
  })

  it('falls back to a plain message when there is none', () => {
    expect(lookErrorMessage(new Error('500:'))).toBe("Couldn't capture the screen.")
  })
})

describe('imageToBlob', () => {
  it('decodes base64 into a named file of the same type', () => {
    const blob = imageToBlob({ dataBase64: PIXEL, mime: 'image/png', name: 'look-screen.png' })

    expect(blob.type).toBe('image/png')
    expect(blob.name).toBe('look-screen.png')
    expect(blob.size).toBeGreaterThan(20)
  })
})

describe('captureIntoComposer', () => {
  it('attaches each captured image to the composer', async () => {
    captureLook.mockResolvedValue({
      images: [{ dataBase64: PIXEL, mime: 'image/png', name: 'a.png' }],
      status: 'captured'
    })

    await captureIntoComposer('screen')

    expect(captureLook).toHaveBeenCalledWith('screen')
    expect(requestComposerAttachImages).toHaveBeenCalledTimes(1)
    expect(requestComposerAttachImages.mock.calls[0]?.[0]).toHaveLength(1)
  })

  it('does nothing when the person cancels the picker', async () => {
    captureLook.mockResolvedValue({ status: 'cancelled' })

    await captureIntoComposer('marquee')

    expect(requestComposerAttachImages).not.toHaveBeenCalled()
    expect(notifyError).not.toHaveBeenCalled()
  })

  it('shows the recovery text when permission is denied', async () => {
    captureLook.mockRejectedValue(new Error('403: Allow Vanta in Screen Recording, then retry.'))

    await captureIntoComposer('window')

    expect(requestComposerAttachImages).not.toHaveBeenCalled()
    expect(notifyError).toHaveBeenCalledTimes(1)
    expect((notifyError.mock.calls[0]?.[0] as Error).message).toBe('Allow Vanta in Screen Recording, then retry.')
  })
})
