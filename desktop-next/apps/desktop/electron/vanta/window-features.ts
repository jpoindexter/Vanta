import path from "node:path";

import { app, BrowserWindow, Menu, powerMonitor, powerSaveBlocker, type MenuItemConstructorOptions } from "electron";

import { buildAppMenuTemplate } from "./app-menu";
import { CH } from "./channels";
import { createDeepLinkRouter, deepLinkFromArgv } from "./deep-links";
import { registerContextMenu } from "./context-menu";
import { registerFindHandlers, installLinuxFindShortcut } from "./find-handlers";
import type { IpcLike } from "./native-handlers";
import { registerPowerFeatures } from "./power-features";
import { createJsonZoomStore, createZoomController, keepZoomApplied, type ZoomController } from "./zoom-controller";

export interface WindowFeatureDeps {
  getMainWindow: () => BrowserWindow | null;
  ipc: IpcLike;
  log: (line: string) => void;
  openExternal: (url: string) => void;
  windowFor: (sender: unknown) => BrowserWindow | null;
}

const broadcast = (channel: string, payload: unknown): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  }
};

function toggleDevTools(window: BrowserWindow | null | undefined): void {
  const contents = window?.webContents;

  if (contents && !contents.isDestroyed()) {
    contents.isDevToolsOpened() ? contents.closeDevTools() : contents.openDevTools({ mode: "detach" });
  }
}

function routeDeepLinks(getMainWindow: () => BrowserWindow | null, ipc: IpcLike) {
  const router = createDeepLinkRouter({
    focusWindow: () => {
      const window = getMainWindow();

      if (window && !window.isDestroyed()) {
        window.isMinimized() && window.restore();
        window.show();
        window.focus();
      }
    },
    send: (channel, payload) => getMainWindow()?.webContents.send(channel, payload)
  });

  ipc.handle(CH.deepLinkReady, () => {
    router.markReady();

    return { ok: true };
  });

  return router;
}

function installAppMenu(deps: WindowFeatureDeps, zoom: ZoomController): void {
  const sendToRenderer = (channel: string) => deps.getMainWindow()?.webContents.send(channel);

  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildAppMenuTemplate({
        appName: app.getName(),
        openExternal: deps.openExternal,
        platform: process.platform,
        reload: window => window?.webContents.reload(),
        sendToRenderer,
        toggleDevTools,
        zoom
      }) as MenuItemConstructorOptions[]
    )
  );
}

/**
 * Everything local to Electron that a window needs: find in page, saved zoom, the application menu,
 * keep-awake and battery, and `vanta://` links. None of it reaches the filesystem, a process or the network.
 */
export function registerWindowFeatures(deps: WindowFeatureDeps) {
  const { getMainWindow, ipc } = deps;
  const userData = app.getPath("userData");
  const zoom = createZoomController(createJsonZoomStore(path.join(userData, "zoom.json")), getMainWindow);

  registerFindHandlers({ getWindow: deps.windowFor, ipc });
  const contextMenu = registerContextMenu(ipc);
  ipc.on(CH.zoomPersist, (_event, percent: unknown) => zoom.persistPercent(percent));

  registerPowerFeatures({
    blocker: powerSaveBlocker,
    broadcast,
    configFile: path.join(userData, "keep-awake.json"),
    ipc,
    log: deps.log,
    monitor: powerMonitor
  });

  const deepLinks = routeDeepLinks(getMainWindow, ipc);
  installAppMenu(deps, zoom);

  return {
    deepLinks,
    /** Called for each window right after it is created. */
    attachWindow: (window: BrowserWindow) => {
      keepZoomApplied(window, zoom);
      installLinuxFindShortcut(window);
      contextMenu.attach(window.webContents as never);
      window.webContents.on("did-start-loading", deepLinks.markNotReady);
    },
    zoom
  };
}

export type WindowFeatures = ReturnType<typeof registerWindowFeatures>;

/**
 * `vanta://` links reach a running app through three doors: `open-url` (macOS), the command line of a second
 * instance (Windows, Linux), and the command line of this launch. The handler is registered once, before ready.
 */
export function listenForDeepLinks(handle: (url: string) => void): void {
  app.on("open-url", (event, url) => {
    event.preventDefault();
    handle(url);
  });

  // Only a packaged build owns the protocol; a dev build would register the bare Electron binary.
  if (app.isPackaged) {
    app.setAsDefaultProtocolClient("vanta");
  }

  const first = deepLinkFromArgv(process.argv);

  if (first) {
    handle(first);
  }
}
