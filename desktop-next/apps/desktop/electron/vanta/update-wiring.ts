import path from 'node:path'
import { userInfo } from 'node:os'
import { app, autoUpdater, BrowserWindow, dialog } from 'electron'
import { CH } from './channels'
import type { IpcLike } from './native-handlers'
import type { ProfileRuntimeHost } from './profile-runtime-host'
import type { CustodyRequestBridge } from './draft-custody-wiring'
import { createDesktopUpdater } from './update-controller'
import { discoverDesktopRelease, type DesktopRelease } from './update-release'
import { downloadDesktopRelease } from './update-download'
import { retainUpdateRollback } from './update-rollback'
import { createUpdateWindowFence } from './update-window-fence'
import { prepareDesktopUpdate } from './update-preparation'
import { freezeUpdateInputs } from './update-input-fence'
import { installWithSquirrel } from './update-squirrel'
import { nativeUpdateKeepsContext } from './update-launch-context'

interface UpdateWiring { ipc: IpcLike; host: Pick<ProfileRuntimeHost, 'prepareUpdate' | 'cancelUpdate' | 'stopAndWait'>; requests: CustodyRequestBridge; isRenderer: (url: string) => boolean }

export function registerDesktopUpdates({ ipc, host, requests, isRenderer }: UpdateWiring): void {
  const windows = () => BrowserWindow.getAllWindows().filter(w => isRenderer(w.webContents.getURL()))
  const fence = createUpdateWindowFence(ipc, windows)
  let owner: BrowserWindow | null = null
  const currentApp = path.resolve(process.execPath, '../../..')
  const keepsContext = nativeUpdateKeepsContext({ args: process.argv, env: process.env, home: userInfo().homedir })
  const supported = app.isPackaged && process.platform === 'darwin' && process.arch === 'arm64' && path.basename(currentApp) === 'Vanta.app' && keepsContext
  const approve = async (release: DesktopRelease) => {
    const options = { type: 'question' as const, buttons: ['Install and restart', 'Cancel'], defaultId: 1, cancelId: 1, noLink: true,
      message: `Install Vanta ${release.version} and restart?`,
      detail: `Download ${Math.ceil(release.bytes! / 1048576)} MB from the Vanta GitHub release. Vanta will save drafts, refuse busy or unresolved work, verify the signed app and keep a rollback copy. Profiles, credentials and approvals will not be migrated.\n\nSource: ${release.sourceCommit}` }
    const answer = owner ? await dialog.showMessageBox(owner, options) : await dialog.showMessageBox(options)
    return answer.response === 0
  }
  const updater = createDesktopUpdater({ version: app.getVersion(), supported, approve,
    unsupportedReason: keepsContext ? undefined : 'Open Vanta normally from Applications before updating. Native restart cannot preserve this isolated or environment-overridden launch.',
    discover: () => discoverDesktopRelease({ version: app.getVersion() }),
    download: release => downloadDesktopRelease({ release, cache: path.join(app.getPath('userData'), 'desktop-updates') }),
    prepare: () => prepareDesktopUpdate({ windows: fence, custody: requests, runtimes: host, freezeInputs: freezeUpdateInputs }),
    backup: async release => { fence.assertPrepared(); await retainUpdateRollback(currentApp, release); fence.assertPrepared() },
    install: (zip, release) => {
      fence.assertPrepared()
      return installWithSquirrel({ updater: autoUpdater, zip, release, stopRuntime: async () => {
        fence.assertPrepared(); await host.stopAndWait(); fence.assertPrepared()
      } })
    },
    progress: value => windows().forEach(w => w.webContents.send(CH.updateProgress, value))
  })
  const senderWindow = (sender: unknown) => {
    const window = BrowserWindow.fromWebContents(sender as Electron.WebContents)
    if (!window || !isRenderer(window.webContents.getURL())) throw new Error('Only the Vanta app can request a Desktop update.')
    return window
  }
  ipc.handle(CH.updateCheck, event => { senderWindow(event.sender); return updater.check() })
  ipc.handle(CH.updateApply, event => { owner = senderWindow(event.sender); return updater.apply() })
}
