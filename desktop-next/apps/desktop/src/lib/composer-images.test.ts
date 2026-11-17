import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ComposerAttachment } from '@/store/composer'

import {
  base64Bytes,
  imageBudgetError,
  imageFromBase64,
  imageFromBlob,
  imageFromDataUrl,
  imageMime,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  promptImages,
  validateComposerImage
} from './composer-images'

const PNG_B64 = 'iVBORw0KGgo='
const chip = (id: string, dataBase64 = PNG_B64): ComposerAttachment => ({
  id,
  imageData: { dataBase64, mime: 'image/png' },
  kind: 'image',
  label: id
})

describe('composer image decode admission', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
  const image = { ok: true as const, image: { mime: 'image/png', dataBase64: PNG_B64 } }

  it('accepts decoded dimensions and releases decoder handlers', async () => {
    let decoder!: { onload: null | (() => void); onerror: null | (() => void); src: string }
    vi.stubGlobal('Image', class {
      onload: null | (() => void) = null
      onerror: null | (() => void) = null
      naturalWidth = 1
      naturalHeight = 1
      src = ''
      constructor() { decoder = this }
    })
    const pending = validateComposerImage(image, 'valid.png')
    decoder.onload?.()
    await expect(pending).resolves.toEqual(image)
    expect(decoder).toMatchObject({ onload: null, onerror: null, src: '' })
  })

  it('refuses a stalled decoder after a bounded wait and releases it', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('Image', class { src = ''; onload = null; onerror = null })
    const pending = validateComposerImage(image, 'stalled.png')
    await vi.advanceTimersByTimeAsync(8000)
    await expect(pending).resolves.toEqual({ ok: false, error: 'stalled.png: could not read the image.' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retains TIFF compatibility and existing refusals without calling the browser decoder', async () => {
    const decoder = vi.fn()
    vi.stubGlobal('Image', decoder)
    const tiff = { ok: true as const, image: { mime: 'image/tiff', dataBase64: 'SUkqAA==' } }
    const refused = { ok: false as const, error: 'existing size refusal' }
    await expect(validateComposerImage(tiff, 'valid.tiff')).resolves.toEqual(tiff)
    await expect(validateComposerImage(refused, 'large.png')).resolves.toEqual(refused)
    expect(decoder).not.toHaveBeenCalled()
  })
})

describe('composer images', () => {
  it('accepts PNG, JPEG and TIFF and normalises jpg', () => {
    expect(imageFromBase64(PNG_B64, 'image/png', 'a.png')).toEqual({
      image: { dataBase64: PNG_B64, mime: 'image/png' },
      ok: true
    })
    expect(imageFromBase64(PNG_B64, 'image/jpg', 'a.jpg')).toMatchObject({ image: { mime: 'image/jpeg' }, ok: true })
  })

  it('names the type when it is not one the server accepts', () => {
    const result = imageFromBase64(PNG_B64, 'image/gif', 'anim.gif')

    expect(result).toEqual({ error: 'anim.gif: Vanta accepts PNG, JPEG or TIFF images (this is image/gif).', ok: false })
  })

  it('refuses an image over the per-image limit with its size', () => {
    const big = 'A'.repeat(Math.ceil(((MAX_IMAGE_BYTES + 1024) * 4) / 3 / 4) * 4)
    const result = imageFromBase64(big, 'image/png', 'huge.png')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(/huge\.png is 10\.0 MB; the limit is 10\.0 MB per image|huge\.png is 1\d\.\d MB/)
  })

  it('splits a data URL and falls back to the supplied type', () => {
    expect(imageFromDataUrl(`data:image/png;base64,${PNG_B64}`, 'p.png')).toMatchObject({ ok: true })
    expect(imageFromDataUrl(`data:;base64,${PNG_B64}`, 'p.png', 'image/png')).toMatchObject({ ok: true })
    expect(imageFromDataUrl('not a url', 'p.png').ok).toBe(false)
  })

  it('infers the type from the file name when the blob has none', () => {
    expect(imageMime('', 'shot.JPG')).toBe('image/jpeg')
    expect(imageMime('image/png; charset=binary')).toBe('image/png')
    expect(imageMime('', 'notes')).toBe('')
  })

  it('reads a blob into base64 and refuses an oversize blob without reading it', async () => {
    const ok = await imageFromBlob(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), 'x.png')

    expect(ok).toMatchObject({ image: { mime: 'image/png' }, ok: true })

    const huge = { size: MAX_IMAGE_BYTES + 1, type: 'image/png' } as Blob
    const refused = await imageFromBlob(huge, 'huge.png')

    expect(refused.ok).toBe(false)
  })

  it('limits the count and the total size', () => {
    const full = Array.from({ length: MAX_IMAGES }, (_, i) => chip(`i${i}`))

    expect(imageBudgetError(full.slice(0, 3), { dataBase64: PNG_B64, mime: 'image/png' })).toBeNull()
    expect(imageBudgetError(full, { dataBase64: PNG_B64, mime: 'image/png' })).toMatch(/up to 4 images/)

    const nine = 'A'.repeat(Math.ceil((9 * 1024 * 1024 * 4) / 3 / 4) * 4)
    const two = [chip('a', nine), chip('b', nine)]

    expect(imageBudgetError(two, { dataBase64: nine, mime: 'image/png' })).toMatch(/per message/)
  })

  it('sends only inline images, and nothing when there are none', () => {
    expect(promptImages([{ id: 'f', kind: 'file', label: 'f' }])).toBeUndefined()
    expect(promptImages([chip('a'), { id: 'f', kind: 'file', label: 'f' }])).toEqual([
      { dataBase64: PNG_B64, mime: 'image/png' }
    ])
    expect(base64Bytes('iVBORw0KGgo=')).toBe(8)
  })
})
