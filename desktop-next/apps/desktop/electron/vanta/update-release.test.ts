import { describe, expect, it, vi } from 'vitest'

import { discoverDesktopRelease } from './update-release'

const hash = 'a'.repeat(64)
const tag = 'desktop-v0.1.1'
const base = `https://github.com/jpoindexter/Vanta/releases/download/${tag}/`
const assets = [
  { name: 'Vanta-0.1.1-arm64.zip', size: 123, digest: `sha256:${hash}`, browser_download_url: base + 'Vanta-0.1.1-arm64.zip' },
  { name: `${tag}-manifest.json`, size: 1000, digest: `sha256:${hash}`, browser_download_url: base + `${tag}-manifest.json` }
]
const release = { tag_name: tag, draft: false, prerelease: false, assets }
const manifest = {
  version: '0.1.1', tag, platform: 'darwin', arch: 'arm64', sourceCommit: 'b'.repeat(40),
  archive: { name: assets[0].name, bytes: 123, sha256: hash },
  notarization: { status: 'Accepted', stapled: true, gatekeeperAccepted: true }
}
function fixture(releases: unknown[] = [release], body: unknown = manifest) {
  return vi.fn(async (url: string | URL | Request) => Response.json(String(url).includes('api.github.com') ? releases : body))
}

describe('regular Desktop update discovery', () => {
  it('finds the regular Desktop release, never global CLI latest or Iris prereleases', async () => {
    const fetcher = fixture([
      { ...release, tag_name: 'v9.9.9' },
      { ...release, tag_name: 'desktop-test-20990101.1', prerelease: true },
      { ...release, tag_name: 'desktop-v9.0.0', draft: true },
      release
    ])
    await expect(discoverDesktopRelease({ version: '0.1.0', fetcher })).resolves.toMatchObject({
      version: '0.1.1', available: true, url: assets[0].browser_download_url, sha256: hash, bytes: 123
    })
    expect(fetcher.mock.calls).toHaveLength(2)
  })

  it.each(['0.1.1', '0.2.0'])('does not download metadata or offer an older/same version to %s', async version => {
    const fetcher = fixture()
    await expect(discoverDesktopRelease({ version, fetcher })).resolves.toMatchObject({ available: false, version: '0.1.1' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('offers the stable version after a same-base test build', async () => {
    await expect(discoverDesktopRelease({ version: '0.1.1-test.1', fetcher: fixture() })).resolves.toMatchObject({ available: true })
  })

  it.each([
    { ...manifest, archive: { ...manifest.archive, sha256: 'c'.repeat(64) } },
    { ...manifest, sourceCommit: 'main' },
    { ...manifest, arch: 'x64' },
    { ...manifest, notarization: { ...manifest.notarization, stapled: false } }
  ])('rejects mismatched or unaccepted artifact identity', async bad => {
    await expect(discoverDesktopRelease({ version: '0.1.0', fetcher: fixture([release], bad) })).rejects.toThrow()
  })

  it('rejects a release asset pointing outside the exact owner/tag path', async () => {
    const altered = { ...release, assets: assets.map(a => ({ ...a, browser_download_url: 'https://evil.example/' + a.name })) }
    await expect(discoverDesktopRelease({ version: '0.1.0', fetcher: fixture([altered]) })).rejects.toThrow()
  })

  it('reports an unavailable feed rather than falsely claiming current', async () => {
    await expect(discoverDesktopRelease({ version: '0.1.0', fetcher: fixture([]) })).rejects.toThrow()
    await expect(discoverDesktopRelease({ version: '0.1.0', fetcher: vi.fn(async () => new Response('', { status: 503 })) })).rejects.toThrow()
    await expect(discoverDesktopRelease({ version: '0.1.0', fetcher: vi.fn(async () => new Response('x'.repeat(1024 * 1024 + 1))) })).rejects.toThrow()
  })
})
