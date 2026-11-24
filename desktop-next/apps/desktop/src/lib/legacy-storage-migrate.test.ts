import { describe, expect, it } from 'vitest'

import { migrateLegacyStorage, renamedKey } from './legacy-storage-migrate'

function memoryStorage(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial))

  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size
    },
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, value)
  }
}

describe('renamedKey', () => {
  it('moves dotted and hyphenated app keys to the new name', () => {
    expect(renamedKey('hermes.desktop.layoutTree.v2')).toBe('vanta.desktop.layoutTree.v2')
    expect(renamedKey('hermes-desktop-theme-v2')).toBe('vanta-desktop-theme-v2')
    expect(renamedKey('hermes-onboarding-skipped-v1')).toBe('vanta-onboarding-skipped-v1')
  })

  it('leaves keys alone that are not app state', () => {
    expect(renamedKey('vanta.desktop.layoutTree.v2')).toBeNull()
    expect(renamedKey('hermes-4')).toBeNull()
    expect(renamedKey('hermes-agent')).toBeNull()
    expect(renamedKey('something-hermes')).toBeNull()
  })
})

describe('migrateLegacyStorage', () => {
  it('copies each old key to the new name and removes the old one', () => {
    const storage = memoryStorage({ 'hermes.desktop.composerQueue.v1': '[1]', other: 'x' })

    expect(migrateLegacyStorage(storage)).toBe(1)
    expect(storage.data.get('vanta.desktop.composerQueue.v1')).toBe('[1]')
    expect(storage.data.has('hermes.desktop.composerQueue.v1')).toBe(false)
    expect(storage.data.get('other')).toBe('x')
  })

  it('never overwrites a value already saved under the new name', () => {
    const storage = memoryStorage({ 'hermes.desktop.pinnedSessions': 'old', 'vanta.desktop.pinnedSessions': 'new' })

    expect(migrateLegacyStorage(storage)).toBe(0)
    expect(storage.data.get('vanta.desktop.pinnedSessions')).toBe('new')
    expect(storage.data.has('hermes.desktop.pinnedSessions')).toBe(false)
  })

  it('is a no-op the second time', () => {
    const storage = memoryStorage({ 'hermes.desktop.a': '1' })
    migrateLegacyStorage(storage)

    expect(migrateLegacyStorage(storage)).toBe(0)
    expect(storage.data.get('vanta.desktop.a')).toBe('1')
  })
})
