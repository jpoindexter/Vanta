import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { MAX_DRAFT_CUSTODY_BYTES, MAX_DRAFT_RECORD_BYTES } from '../../../shared/src/vanta/draft-custody'

export const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT'
export const custodyDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** Fixed directory + hashed keys only. No renderer-selected source/output paths. */
export function createCustodyFiles(root: string) {
  const file = (key: string) => {
    if (!/^[a-f0-9]{64}\.(owner|draft|send|queue)\.json$/.test(key)) throw new Error('Invalid custody storage key.')
    return path.join(root, key)
  }
  return {
    entries: () => readdir(root).catch(error => { if (missing(error)) return []; throw error }),
    read: async (key: string): Promise<unknown | null> => {
      const target = file(key)
      try {
        if ((await stat(target)).size > MAX_DRAFT_RECORD_BYTES) throw new Error('Saved draft custody exceeds its size limit.')
        return JSON.parse(await readFile(target, 'utf8'))
      } catch (error) { if (missing(error)) return null; throw error }
    },
    size: (key: string) => stat(file(key)).then(value => value.size),
    remove: (key: string) => unlink(file(key)).catch(error => { if (!missing(error)) throw error }),
    write: async (key: string, value: unknown) => {
      const text = JSON.stringify(value)
      if (Buffer.byteLength(text) > MAX_DRAFT_RECORD_BYTES) throw new Error('Unsent draft exceeds its storage limit.')
      const entries = await readdir(root).catch(error => { if (missing(error)) return []; throw error })
      const sizes = await Promise.all(entries.filter(name => /^[a-f0-9]{64}\.(owner|draft|send|queue)\.json$/.test(name) && name !== key).map(name => stat(file(name)).then(value => value.size)))
      if (sizes.reduce((sum, size) => sum + size, Buffer.byteLength(text)) > MAX_DRAFT_CUSTODY_BYTES) throw new Error('Saved draft storage is full; existing bytes were retained.')
      await mkdir(root, { recursive: true, mode: 0o700 })
      const target = file(key), temporary = `${target}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, text, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
        await rename(temporary, target)
      } finally { await unlink(temporary).catch(error => { if (!missing(error)) throw error }) }
    }
  }
}
