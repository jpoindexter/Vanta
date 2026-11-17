import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { DesktopRelease } from './update-release'

const run = promisify(execFile)
const REQUIREMENT = '=identifier "studio.theft.vanta-next" and anchor apple generic and certificate leaf[subject.OU] = "5352PXMNV5"'
const asarDigest = async (app: string) => createHash('sha256').update(await fs.readFile(path.join(app, 'Contents/Resources/app.asar'))).digest('hex')

export async function verifyVantaPublisher(app: string): Promise<void> {
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '-R', REQUIREMENT, app])
}

/** Retains a verified bundle and a receipt. Never removes an earlier rollback or mutates user profiles. */
export async function retainUpdateRollback(app: string, release: DesktopRelease): Promise<string> {
  if (!path.isAbsolute(app) || path.basename(app) !== 'Vanta.app' || (await fs.lstat(app)).isSymbolicLink()) throw new Error('A regular installed Vanta.app is required.')
  await verifyVantaPublisher(app)
  const root = path.join(path.dirname(app), '.vanta-install-backups')
  await fs.mkdir(root, { recursive: true, mode: 0o700 })
  if ((await fs.lstat(root)).isSymbolicLink()) throw new Error('Rollback directory must not be a link.')
  const record = await fs.mkdtemp(path.join(root, 'automatic-')), backup = path.join(record, 'Vanta.app')
  const before = await asarDigest(app)
  await run('/usr/bin/ditto', [app, backup])
  await verifyVantaPublisher(backup)
  if (await asarDigest(backup) !== before || await asarDigest(app) !== before) throw new Error('Rollback does not match the running app.')
  const { stdout } = await run('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', path.join(app, 'Contents/Info.plist')])
  await fs.writeFile(path.join(record, 'receipt.json'), JSON.stringify({ schema: 1, phase: 'prepared', target: app, backup,
    previousVersion: stdout.trim(), previousAsarSha256: before, expectedVersion: release.version, expectedSourceCommit: release.sourceCommit,
    archiveSha256: release.sha256, preparedAt: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  return record
}
