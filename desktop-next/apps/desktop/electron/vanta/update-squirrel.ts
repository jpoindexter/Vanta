import type { AutoUpdater } from 'electron'
import type { DesktopRelease } from './update-release'
import { createNativeUpdateFeed } from './update-native-feed'

interface InstallOptions {
  updater: Pick<AutoUpdater, 'on' | 'removeListener' | 'setFeedURL' | 'checkForUpdates' | 'quitAndInstall'>
  zip: string
  release: DesktopRelease
  stopRuntime: () => Promise<void>
}
const observedUpdaters = new WeakSet<object>()

/** Squirrel.Mac performs the publisher-identity check and native replacement; no script can bypass it. */
export async function installWithSquirrel({ updater, zip, release, stopRuntime }: InstallOptions): Promise<void> {
  // A timed-out native check cannot be cancelled; a late error must not become an uncaught exception.
  if (!observedUpdaters.has(updater)) { observedUpdaters.add(updater); updater.on('error', () => {}) }
  const feed = await createNativeUpdateFeed(zip, release)
  let staged = false
  try {
    await new Promise<void>((resolve, reject) => {
      const fail = (error: Error) => { cleanup(); reject(error) }
      const unavailable = () => fail(new Error('The approved update was not accepted by the native updater.'))
      const downloaded = () => { staged = true; cleanup(); resolve() }
      const timer = setTimeout(() => fail(Object.assign(new Error('Native update verification timed out. Keep this app open; work remains paused and no retry was started.'), { keepPrepared: true })), 3 * 60_000)
      const cleanup = () => {
        clearTimeout(timer)
        updater.removeListener('error', fail); updater.removeListener('update-not-available', unavailable); updater.removeListener('update-downloaded', downloaded)
      }
      updater.on('error', fail); updater.on('update-not-available', unavailable); updater.on('update-downloaded', downloaded)
      try { updater.setFeedURL({ url: feed.url, serverType: 'default' }); updater.checkForUpdates() }
      catch (error) { fail(error instanceof Error ? error : new Error('Native update could not start.')) }
    })
    await stopRuntime()
    updater.quitAndInstall()
  } catch (error) {
    if (staged) throw Object.assign(new Error('The approved update is staged, but restart did not finish. Keep this app open; work remains paused.'), { keepPrepared: true })
    throw error
  } finally { await feed.close() }
}
