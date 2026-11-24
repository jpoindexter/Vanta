import { afterEach, expect, it, vi } from 'vitest'

import { promptAttachmentParams } from './composer-attachment-params'

afterEach(() => vi.unstubAllGlobals())

const files = [
  { id: 'a', kind: 'file' as const, label: 'brief.md', path: '/work/brief.md', refText: '@brief.md' },
  { id: 'b', kind: 'file' as const, label: 'brief.md', path: '/work/brief.md', refText: '@brief.md' },
  { id: 'image', kind: 'image' as const, label: 'image', imageData: { mime: 'image/png', dataBase64: 'iVBORw0KGgo=' } }
]

it('carries deduplicated native local file references alongside the exact inline image payload', () => {
  vi.stubGlobal('window', { desktopBridge: { vanta: {} } })
  expect(promptAttachmentParams(files)).toEqual({ files: ['brief.md'], images: [files[2].imageData] })
})

it('preserves the legacy gateway image payload without introducing native file fields', () => {
  vi.stubGlobal('window', {})
  expect(promptAttachmentParams(files)).toEqual({ images: [files[2].imageData] })
})

it('does not invent file references for empty or pathless chips', () => {
  vi.stubGlobal('window', { desktopBridge: { vanta: {} } })
  expect(promptAttachmentParams([{ id: 'x', kind: 'file', label: 'missing' }])).toEqual({})
})

it('preserves quoted relative paths and refuses unstaged or legacy references on the native route', () => {
  vi.stubGlobal('window', { desktopBridge: { vanta: {} } })
  expect(promptAttachmentParams([{ ...files[0], refText: '@"folder/brief notes.md"' }])).toEqual({ files: ['folder/brief notes.md'] })
  for (const refText of [undefined, '@file:brief.md', '@/another/brief.md', '@../brief.md']) {
    expect(() => promptAttachmentParams([{ ...files[0], refText }])).toThrow()
  }
})
