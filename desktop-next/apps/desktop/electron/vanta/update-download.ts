import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

import { maintainedFetch } from '../../../../../vanta-ts/desktop-native/maintained-fetch.mjs'
import type { DesktopRelease } from './update-release'

interface DownloadOptions { release: DesktopRelease; cache: string; fetcher?: typeof fetch }
const CDN_HOSTS = new Set(['github.com', 'release-assets.githubusercontent.com'])
function archiveTarget(url: string): URL {
  const target = new URL(url)
  if (target.protocol !== 'https:' || target.username || target.password || target.port || !CDN_HOSTS.has(target.hostname)) throw new Error('Desktop archive redirect was refused.')
  return target
}

function boundArchive(release: DesktopRelease): { url: string; sha256: string; bytes: number } {
  const { version, url, sha256, bytes, available } = release
  if (!available || !/^\d+\.\d+\.\d+$/.test(version)
    || url !== `https://github.com/jpoindexter/Vanta/releases/download/desktop-v${version}/Vanta-${version}-arm64.zip`
    || !sha256 || !/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(bytes) || !bytes || bytes > 1024 ** 3 || bytes < 1) {
    throw new Error('No exact verified Desktop archive is selected.')
  }
  return { url, sha256, bytes }
}

async function fetchArchive(url: string, fetcher: typeof fetch, signal: AbortSignal): Promise<Response> {
  for (let hops = 0; hops < 5; hops++) {
    archiveTarget(url)
    const response = await fetcher(url, { redirect: 'manual', signal, cache: 'no-store' })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location) throw new Error('Desktop archive redirect has no target.')
      url = new URL(location, url).href
      continue
    }
    if (!response.ok || !response.body) throw new Error(`Desktop archive unavailable: HTTP ${response.status}.`)
    return response
  }
  throw new Error('Desktop archive exceeded its redirect limit.')
}

async function writeVerified(response: Response, file: string, expected: { bytes: number; sha256: string }, signal: AbortSignal): Promise<void> {
  const reader = response.body!.getReader(), hash = createHash('sha256')
  let bytes = 0
  async function* chunks() {
    try {
      while (true) {
        const next = await reader.read()
        if (next.done) break
        bytes += next.value.byteLength
        if (bytes > expected.bytes) throw new Error('Desktop archive exceeds its declared size.')
        hash.update(next.value)
        yield next.value
      }
    } finally { await reader.cancel() }
  }
  await pipeline(chunks(), createWriteStream(file, { flags: 'wx', mode: 0o600 }), { signal })
  if (bytes !== expected.bytes || hash.digest('hex') !== expected.sha256) throw new Error('Desktop archive integrity check failed.')
}

/** Returns inert private ZIP bytes only. Publisher verification and fresh restart approval remain separate gates. */
export async function downloadDesktopRelease({ release, cache, fetcher = maintainedFetch }: DownloadOptions): Promise<string> {
  const expected = boundArchive(release)
  if (!path.isAbsolute(cache) || path.parse(cache).root === cache) throw new Error('A private update cache is required.')
  await fs.mkdir(cache, { recursive: true, mode: 0o700 })
  if (!(await fs.lstat(cache)).isDirectory() || (await fs.lstat(cache)).isSymbolicLink()) throw new Error('Update cache must be a directory, not a link.')
  const staging = await fs.mkdtemp(path.join(cache, 'download-'))
  try {
    const signal = AbortSignal.timeout(5 * 60_000)
    const response = await fetchArchive(expected.url, fetcher, signal)
    const partial = path.join(staging, 'partial.zip'), complete = path.join(staging, 'update.zip')
    await writeVerified(response, partial, expected, signal)
    await fs.rename(partial, complete)
    return complete
  } catch (error) {
    // Only this call's generated staging directory; never a prior download or owner data.
    await fs.rm(staging, { recursive: true, force: true })
    throw error
  }
}
