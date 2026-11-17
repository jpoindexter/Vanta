/**
 * Saved window state (layout, drafts, queues, preferences) used to live under keys that began with the name of the
 * app this renderer was derived from. The keys now carry Vanta's name; this copies each old key to its new name once
 * so nothing a person saved is lost, then removes the old key. It must run before any store reads its key, so
 * main.tsx imports it first.
 */
const LEGACY_PREFIX = /^hermes(?=[.-])/
// Names that belong to other products (a model id, an install folder), not to this app's saved state.
const NOT_APP_STATE = /^hermes-(?:agent|\d)/

export function renamedKey(key: string): null | string {
  return LEGACY_PREFIX.test(key) && !NOT_APP_STATE.test(key) ? key.replace(LEGACY_PREFIX, 'vanta') : null
}

export function migrateLegacyStorage(storage: Pick<Storage, 'getItem' | 'key' | 'length' | 'removeItem' | 'setItem'>): number {
  const keys: string[] = []

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)

    if (key) {
      keys.push(key)
    }
  }

  let moved = 0

  for (const key of keys) {
    const next = renamedKey(key)

    if (!next) {
      continue
    }

    // A value already saved under the new name is newer than the copy being carried over.
    if (storage.getItem(next) === null) {
      const value = storage.getItem(key)

      if (value !== null) {
        storage.setItem(next, value)
        moved += 1
      }
    }

    storage.removeItem(key)
  }

  return moved
}

try {
  migrateLegacyStorage(window.localStorage)
} catch {
  // Storage can be unavailable (private window, blocked site data); the app starts with defaults.
}
