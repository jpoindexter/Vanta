import type { DesktopRelease } from './update-release'

interface UpdateProgress { stage: 'prepare' | 'fetch' | 'update' | 'restart' | 'error'; message: string; percent: null; error: string | null; at: number }
interface UpdateDeps {
  version: string
  supported: boolean
  unsupportedReason?: string
  discover: () => Promise<DesktopRelease>
  approve: (release: DesktopRelease) => Promise<boolean>
  download: (release: DesktopRelease) => Promise<string>
  prepare: () => Promise<() => Promise<void>>
  backup: (release: DesktopRelease) => Promise<void>
  install: (zip: string, release: DesktopRelease) => Promise<void>
  progress: (progress: UpdateProgress) => void
}
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Desktop update did not finish.'

/** Native owns authority and release identity; passive checks never download or stage an update. */
export function createDesktopUpdater(deps: UpdateDeps) {
  let applying = false
  let uncertain = false
  const progress = (stage: UpdateProgress['stage'], message: string) => deps.progress({ stage, message, percent: null, error: stage === 'error' ? message : null, at: Date.now() })
  const check = async () => {
    const base = { supported: deps.supported, mechanism: 'electron-updater' as const, currentVersion: deps.version, channel: 'stable', updateAvailable: false }
    if (!deps.supported) return { ...base, reason: deps.unsupportedReason ?? 'Signed Apple Silicon macOS installation required.' }
    try {
      const release = await deps.discover()
      return { ...base, updateAvailable: release.available, latestTag: `desktop-v${release.version}`, sourceVersion: release.version }
    } catch (error) { return { ...base, error: messageOf(error), message: messageOf(error) } }
  }
  const fail = async (error: unknown, releasePreparation?: () => Promise<void>) => {
    let message = messageOf(error)
    uncertain = Boolean(error && typeof error === 'object' && 'keepPrepared' in error)
    try { if (!uncertain) await releasePreparation?.() }
    catch { uncertain = true; message += ' Update preparation could not be released; new work remains paused. Keep this app open and review its status.' }
    progress('error', message)
    return { ok: false, error: message, message }
  }
  const apply = async () => {
    if (uncertain) return { ok: false, error: 'A native update may still be completing. Restart Vanta before checking installation again; no retry was started.' }
    if (applying || !deps.supported) return { ok: false, error: applying ? 'An update is already in progress.' : 'Unsupported installation.' }
    applying = true
    let releasePreparation: (() => Promise<void>) | undefined
    try {
      const release = await deps.discover()
      if (!release.available) return { ok: true, updateAvailable: false }
      if (!await deps.approve(release)) return { ok: false, error: 'Update cancelled; no app was changed.' }
      progress('fetch', `Downloading Vanta ${release.version} and checking its integrity…`)
      const zip = await deps.download(release)
      progress('prepare', 'Saving drafts and checking that all local work is idle…')
      releasePreparation = await deps.prepare()
      await deps.backup(release)
      progress('update', 'Rollback retained. Verifying the signed update with macOS…')
      await deps.install(zip, release)
      uncertain = true
      progress('restart', 'Restarting into the approved update…')
      return { ok: true, handedOff: true }
    } catch (error) { return await fail(error, releasePreparation) }
    finally { applying = false }
  }
  return { check, apply }
}
