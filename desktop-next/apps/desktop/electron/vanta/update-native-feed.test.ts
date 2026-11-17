import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { createNativeUpdateFeed } from './update-native-feed'

describe('private Squirrel feed', () => {
  it('serves only the bound feed/archive on loopback and rejects other routes/methods', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vanta-feed-'))
    const zip = path.join(dir, 'update.zip'); await fs.writeFile(zip, 'zip')
    const feed = await createNativeUpdateFeed(zip, { version: '0.1.1', available: true, bytes: 3, sha256: createHash('sha256').update('zip').digest('hex') })
    try {
      const body = await (await fetch(feed.url)).json() as { url: string; name: string }
      expect(new URL(body.url).hostname).toBe('127.0.0.1'); expect(body.name).toBe('0.1.1')
      expect(await (await fetch(body.url)).text()).toBe('zip')
      expect((await fetch(body.url, { method: 'HEAD' })).headers.get('content-length')).toBe('3')
      expect((await fetch(new URL('/feed', feed.url))).status).toBe(404)
      expect((await fetch(feed.url, { method: 'POST' })).status).toBe(405)
    } finally { await feed.close(); await fs.rm(dir, { recursive: true, force: true }) }
  })
  it('keeps the approved descriptor when the path is replaced, and refuses same-inode corruption', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vanta-feed-'))
    const zip = path.join(dir, 'update.zip'); await fs.writeFile(zip, 'zip')
    const feed = await createNativeUpdateFeed(zip, { version: '0.1.1', available: true, bytes: 3, sha256: createHash('sha256').update('zip').digest('hex') })
    try {
      const body = await (await fetch(feed.url)).json() as { url: string }
      await fs.rename(zip, zip + '.original'); await fs.writeFile(zip, 'bad')
      expect(await (await fetch(body.url)).text()).toBe('zip')
      await fs.writeFile(zip + '.original', 'bad')
      await expect(fetch(body.url).then(r => r.text())).rejects.toThrow()
    } finally { await feed.close(); await fs.rm(dir, { recursive: true, force: true }) }
  })
  it('refuses changed archive size before listening', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vanta-feed-'))
    const zip = path.join(dir, 'update.zip'); await fs.writeFile(zip, 'zip')
    try { await expect(createNativeUpdateFeed(zip, { version: '0.1.1', available: true, bytes: 4 })).rejects.toThrow('no longer available') }
    finally { await fs.rm(dir, { recursive: true, force: true }) }
  })
})
