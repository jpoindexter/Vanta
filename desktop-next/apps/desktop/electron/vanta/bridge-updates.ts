import { type IpcRendererLike, subscribe } from './bridge-core'
import { CH } from './channels'

export function updateApi(ipc: IpcRendererLike) {
  return {
    check: () => ipc.invoke(CH.updateCheck),
    apply: () => ipc.invoke(CH.updateApply),
    onProgress: (callback: (value: unknown) => void) => subscribe(ipc, CH.updateProgress, callback),
    onPrepare: (flush: () => Promise<void>) => subscribe<string>(ipc, CH.updatePrepare, lease => {
      void Promise.resolve().then(flush).then(
        () => ipc.send(CH.updatePrepared, { lease, ok: true }),
        () => ipc.send(CH.updatePrepared, { lease, ok: false })
      )
    }),
    onRelease: (callback: () => void) => subscribe(ipc, CH.updateRelease, callback)
  }
}
