import { z } from 'zod'

import { maintainedFetch } from '../../../../../vanta-ts/desktop-native/maintained-fetch.mjs'

export const DESKTOP_RELEASES_API = 'https://api.github.com/repos/jpoindexter/Vanta/releases?per_page=20'
const VERSION = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/
const SHA = /^[a-f0-9]{64}$/
const assetSchema = z.object({
  name: z.string(), size: z.number().int().positive().max(1024 ** 3),
  digest: z.string().nullable().optional(), browser_download_url: z.string()
})
const releaseSchema = z.object({ tag_name: z.string(), draft: z.boolean(), prerelease: z.boolean(), assets: z.array(assetSchema) })
const manifestSchema = z.object({
  version: z.string().regex(VERSION), tag: z.string(), platform: z.literal('darwin'), arch: z.literal('arm64'),
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
  archive: z.object({ name: z.string(), bytes: z.number().int().positive().max(1024 ** 3), sha256: z.string().regex(SHA) }),
  notarization: z.object({ status: z.literal('Accepted'), stapled: z.literal(true), gatekeeperAccepted: z.literal(true) })
})

export interface DesktopRelease {
  version: string
  available: boolean
  url?: string
  sha256?: string
  bytes?: number
  sourceCommit?: string
}
interface DiscoveryOptions { version: string; fetcher?: typeof fetch }

/** Numeric stable versions only; release tags cannot turn into paths or commands. */
export function compareDesktopVersions(left: string, right: string): number {
  if (!VERSION.test(left) || !VERSION.test(right)) throw new Error('Unsupported Desktop version.')
  const a = left.split('.').map(BigInt), b = right.split('.').map(BigInt)
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1
  }
  return 0
}

async function readMetadata(url: string, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(url, { signal: AbortSignal.timeout(15_000), headers: { Accept: 'application/json' }, cache: 'no-store' })
  if (!response.ok || !response.body) throw new Error(`Desktop release check unavailable: HTTP ${response.status}.`)
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > 1024 * 1024) throw new Error('Desktop release metadata exceeds the size limit.')
      chunks.push(next.value)
    }
  } finally { await reader.cancel() }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function asset(release: z.infer<typeof releaseSchema>, name: string) {
  const matches = release.assets.filter(a => a.name === name)
  const expected = `https://github.com/jpoindexter/Vanta/releases/download/${release.tag_name}/${name}`
  if (matches.length !== 1 || matches[0].browser_download_url !== expected) throw new Error('Desktop release asset identity does not match.')
  return matches[0]
}
function assertManifest(manifest: z.infer<typeof manifestSchema>, release: z.infer<typeof releaseSchema>, zip: z.infer<typeof assetSchema>) {
  if (manifest.version !== release.tag_name.slice(9) || manifest.tag !== release.tag_name || manifest.archive.name !== zip.name
    || manifest.archive.bytes !== zip.size || `sha256:${manifest.archive.sha256}` !== zip.digest) throw new Error('Desktop release manifest does not match its published archive.')
}

/** A metadata-only check: never downloads a ZIP, requests a token, or consults global CLI Latest. */
export async function discoverDesktopRelease({ version, fetcher = maintainedFetch }: DiscoveryOptions): Promise<DesktopRelease> {
  const current = version.split('-')[0]
  if (!VERSION.test(current)) throw new Error('Unsupported installed Desktop version.')
  const releases = z.array(releaseSchema).max(20).parse(await readMetadata(DESKTOP_RELEASES_API, fetcher))
    .filter(r => !r.draft && !r.prerelease && r.tag_name.startsWith('desktop-v') && VERSION.test(r.tag_name.slice(9)))
    .sort((a, b) => compareDesktopVersions(b.tag_name.slice(9), a.tag_name.slice(9)))
  const release = releases[0]
  // shortcut: bounded release window; fail visibly rather than claiming current if stable is absent.
  if (!release) throw new Error('No regular Desktop release is available in the release feed.')
  const latest = release.tag_name.slice(9)
  const comparison = compareDesktopVersions(latest, current)
  if (comparison < 0 || (comparison === 0 && version === current)) return { version: latest, available: false }
  const zip = asset(release, `Vanta-${latest}-arm64.zip`)
  const metadata = asset(release, `${release.tag_name}-manifest.json`)
  const manifest = manifestSchema.parse(await readMetadata(metadata.browser_download_url, fetcher))
  assertManifest(manifest, release, zip)
  return { version: latest, available: true, url: zip.browser_download_url, sha256: manifest.archive.sha256,
    bytes: zip.size, sourceCommit: manifest.sourceCommit }
}
