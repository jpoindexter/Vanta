import { type IpcRendererLike, subscribe } from "./bridge-core";
import { CH } from "./channels";

/** Window-level features: find in page, keep-awake, battery, menu-driven requests, deep links, link failures. */
export function windowFeatureApi(ipc: IpcRendererLike) {
  const listen = <T>(channel: string) => (callback: (payload: T) => void) => subscribe(ipc, channel, callback);

  return {
    findInPage: (query: string, options?: { findNext?: boolean; forward?: boolean }) =>
      ipc.invoke(CH.findInPage, query, options),
    getOnBattery: () => ipc.invoke<boolean>(CH.batteryGet),
    onBatteryChanged: listen<boolean>(CH.batteryChanged),
    onClosePreviewRequested: listen<void>(CH.closePreviewRequested),
    onDeepLink: listen<{ kind: string; name: string; params: Record<string, string> }>(CH.deepLink),
    onExternalOpenFailed: listen<{ code?: string; message?: string; url: string }>(CH.externalOpenFailed),
    onFoundInPage: listen<{ activeMatchOrdinal: number; count: number }>(CH.foundInPage),
    onOpenFindBarRequested: listen<void>(CH.openFindBar),
    onOpenFolderRequested: listen<void>(CH.openFolderRequested),
    setActiveWork: (payload: unknown) => ipc.send(CH.activeWork, payload),
    setKeepAwake: (mode: unknown) => ipc.send(CH.keepAwake, mode),
    signalDeepLinkReady: () => ipc.invoke(CH.deepLinkReady),
    stopFindInPage: () => ipc.invoke(CH.stopFindInPage)
  };
}
