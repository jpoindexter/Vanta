import { constants } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { createServer, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { pipeline } from 'node:stream/promises'
import type { DesktopRelease } from './update-release'

/** Keep the last chunk until the same descriptor's bytes match: a changed file never yields a complete ZIP. */
async function serveVerified(file: FileHandle, res: ServerResponse, expected: DesktopRelease): Promise<void> {
  async function* verifiedChunks() {
    const hash = createHash('sha256'), buffer = Buffer.alloc(64 * 1024)
    let pending: Buffer | undefined, bytes = 0
    while (true) {
      const { bytesRead } = await file.read(buffer, 0, buffer.length, bytes)
      if (!bytesRead) break
      const chunk = Buffer.from(buffer.subarray(0, bytesRead))
      bytes += bytesRead; hash.update(chunk)
      if (bytes > expected.bytes!) throw new Error('Update archive changed.')
      if (pending) yield pending
      pending = chunk
    }
    if (bytes !== expected.bytes || hash.digest('hex') !== expected.sha256) throw new Error('Update archive changed.')
    if (pending) yield pending
  }
  try { await pipeline(verifiedChunks(), res) } catch { res.destroy() }
}

/** Squirrel receives only a private, already-verified local ZIP, never an arbitrary renderer URL. */
export async function createNativeUpdateFeed(zip: string, release: DesktopRelease) {
  const file = await open(zip, constants.O_RDONLY | constants.O_NOFOLLOW)
  const stat = await file.stat()
  if (!stat.isFile() || stat.size !== release.bytes || !/^[a-f0-9]{64}$/.test(release.sha256 ?? '')) {
    await file.close(); throw new Error('Verified update archive is no longer available.')
  }
  const token = randomUUID(), feedPath = `/${token}/feed`, zipPath = `/${token}/update.zip`
  let base = ''
  const server = createServer((req, res) => {
    if (!['GET', 'HEAD'].includes(req.method ?? '')) { res.writeHead(405).end(); return }
    if (req.url === feedPath) {
      const body = JSON.stringify({ url: base + zipPath, name: release.version, notes: 'Approved Vanta Desktop update', sha256: release.sha256, size: release.bytes })
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(req.method === 'HEAD' ? undefined : body)
    } else if (req.url === zipPath) {
      res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': stat.size, 'Cache-Control': 'no-store' })
      if (req.method === 'HEAD') { res.end(); return }
      void serveVerified(file, res, release)
    } else res.writeHead(404).end()
  })
  server.requestTimeout = 60_000
  server.headersTimeout = 10_000
  try { await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) }) }
  catch (error) { await file.close(); throw error }
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return { url: base + feedPath, close: async () => {
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() })
    await file.close()
  } }
}
