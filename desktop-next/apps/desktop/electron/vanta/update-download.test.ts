import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { downloadDesktopRelease } from './update-download'

const bytes = Buffer.from('synthetic archive bytes, not an executable')
const release = { version: '0.1.1', available: true, bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  url: 'https://github.com/jpoindexter/Vanta/releases/download/desktop-v0.1.1/Vanta-0.1.1-arm64.zip' }
const roots: string[] = []
async function root() { const value = await fs.mkdtemp(path.join(os.tmpdir(), 'vanta-update-download-')); roots.push(value); return value }
afterEach(async () => { await Promise.all(roots.splice(0).map(r => fs.rm(r, { recursive: true }))) })

describe('verified Desktop archive download', () => {
  it('makes bytes available only after exact size and SHA256 verification', async () => {
    const cache = await root(), fetcher = vi.fn(async () => new Response(bytes))
    const file = await downloadDesktopRelease({ release, cache, fetcher })
    expect(await fs.readFile(file)).toEqual(bytes)
    expect(file).toMatch(/update\.zip$/)
    expect((await fs.stat(file)).mode & 0o777).toBe(0o600)
  })

  it.each([
    { ...release, sha256: 'a'.repeat(64) },
    { ...release, bytes: bytes.length - 1 },
    { ...release, bytes: bytes.length + 1 }
  ])('does not expose a verified archive after integrity failure', async bad => {
    const cache = await root()
    await expect(downloadDesktopRelease({ release: bad, cache, fetcher: async () => new Response(bytes) })).rejects.toThrow()
    expect(await fs.readdir(cache)).toEqual([])
  })

  it('follows only the known public GitHub release asset CDN', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'https://release-assets.githubusercontent.com/test.zip?signature=fixture' } }))
      .mockResolvedValueOnce(new Response(bytes))
    await downloadDesktopRelease({ release, cache: await root(), fetcher })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[0][1].redirect).toBe('manual')
  })

  it.each(['http://127.0.0.1/private', 'https://evil.example/test.zip', 'https://user:pass@release-assets.githubusercontent.com/test.zip'])('rejects a redirect to %s', async target => {
    const cache = await root(), fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { Location: target } }))
    await expect(downloadDesktopRelease({ release, cache, fetcher })).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(await fs.readdir(cache)).toEqual([])
  })

  it('refuses an unbound artifact URL before network or filesystem work', async () => {
    const fetcher = vi.fn(), cache = await root()
    await expect(downloadDesktopRelease({ release: { ...release, url: 'https://github.com/other/repo/release.zip' }, cache, fetcher })).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
    expect(await fs.readdir(cache)).toEqual([])
  })
})
