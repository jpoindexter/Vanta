import path from "node:path";
import { pathToFileURL } from "node:url";

import { app, BrowserWindow, globalShortcut, Menu, nativeImage, screen, Tray } from "electron";

import type { VantaTransport } from "../../../shared/src/vanta";

import { registerMiniWindow } from "./mini-window";
import type { MiniWindowController } from "./mini-window-controller";
import type { IpcLike } from "./native-handlers";
import { type QuickEntryHost, registerQuickEntry } from "./quick-entry-host";
import { registerTraySetting } from "./tray-setting";
import { createTrayHost, readTrayState, type TrayHost } from "./vanta-tray";
import { lockNavigation, secureWebPreferences } from "./window-host";

const QUICK_ALWAYS_ON_TOP_LEVEL = "floating";

export interface ExtrasDeps {
  appRoot: string;
  devServer?: string;
  getMainWindow: () => BrowserWindow | null;
  ipc: IpcLike;
  isRenderer: (url: string) => boolean;
  log: (line: string) => void;
  openExternal: (url: string) => void;
  /** Create the main window if it is gone, and show it. */
  showMain: () => void;
  transport: VantaTransport;
}

const broadcast = (channel: string, payload: unknown): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  }
};

function trayIcon(appRoot: string) {
  if (process.platform === "darwin") {
    const symbol = nativeImage.createFromNamedImage("ellipsis", [-1, 13, 0.6]);
    symbol.setTemplateImage(true);

    return symbol;
  }

  return nativeImage.createFromPath(path.join(appRoot, "assets", "icon.png")).resize({ height: 18, width: 18 });
}

const rendererUrl = (deps: ExtrasDeps, query: string): string =>
  deps.devServer
    ? `${deps.devServer.replace(/\/$/, "")}/${query}`
    : `${pathToFileURL(path.join(deps.appRoot, "dist", "index.html")).toString()}${query}`;

function createQuickWindow(deps: ExtrasDeps, preloadPath: string): BrowserWindow {
  const win = new BrowserWindow({
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    frame: false,
    fullscreenable: false,
    hasShadow: false,
    height: 168,
    maximizable: false,
    minimizable: false,
    resizable: false,
    show: false,
    skipTaskbar: true,
    transparent: true,
    webPreferences: secureWebPreferences(preloadPath),
    width: 640
  });

  win.setAlwaysOnTop(true, QUICK_ALWAYS_ON_TOP_LEVEL);
  lockNavigation(win, deps.isRenderer, deps.openExternal);
  void win.loadURL(rendererUrl(deps, "?win=quick"));

  return win;
}

function setBadge(text: string): void {
  if (process.platform === "darwin") {
    app.dock?.setBadge(text);
  } else {
    app.setBadgeCount(Number(text) || 0);
  }
}

interface TrayParts {
  mini: MiniWindowController;
  quick: QuickEntryHost;
  showMain: () => void;
  tray: () => null | TrayHost;
}

function createTray(deps: ExtrasDeps, parts: TrayParts): TrayHost {
  return createTrayHost({
    actions: {
      quit: () => app.quit(),
      showQuickEntry: parts.quick.show,
      showVanta: parts.showMain,
      toggleMini: () => {
        parts.mini.toggle();
        parts.tray()?.rerender();
      }
    },
    buildMenu: template => Menu.buildFromTemplate(template),
    createTray: () => new Tray(trayIcon(deps.appRoot)),
    isMiniOpen: parts.mini.isOpen,
    poll: () => readTrayState(call => deps.transport.request(call as never)),
    setBadge
  });
}

function createQuickEntry(deps: ExtrasDeps, files: { preloadPath: string; settingsFile: string }, self: () => QuickEntryHost): QuickEntryHost {
  return registerQuickEntry({
    ensureMain: async () => {
      if (!deps.getMainWindow() || deps.getMainWindow()?.isDestroyed()) {
        deps.showMain();
        await self().mainReady();
      }

      return deps.getMainWindow();
    },
    getMainContents: () => deps.getMainWindow()?.webContents,
    globalShortcut,
    ipc: deps.ipc,
    log: deps.log,
    openQuickWindow: () => createQuickWindow(deps, files.preloadPath),
    settingsFile: files.settingsFile,
    workArea: () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  });
}

/**
 * The mini window, the global quick-entry composer and the tray. Everything they do goes through windows the
 * renderer already has or the existing approval route; none of it adds a way to run or write anything.
 */
export function registerShellExtras(deps: ExtrasDeps) {
  const userData = app.getPath("userData");
  const preloadPath = path.join(deps.appRoot, "dist", "electron-preload.js");
  let tray: null | TrayHost = null;

  const mini = registerMiniWindow({
    devServer: deps.devServer,
    getMainWindow: deps.getMainWindow,
    isRenderer: deps.isRenderer,
    openExternal: deps.openExternal,
    preloadPath,
    rendererIndexPath: path.join(deps.appRoot, "dist", "index.html")
  });

  const quick: QuickEntryHost = createQuickEntry(deps, { preloadPath, settingsFile: path.join(userData, "quick-entry.json") }, () => quick);

  const setting = registerTraySetting({
    apply: enabled => {
      tray?.dispose();
      tray = enabled ? createTray(deps, { mini, quick, showMain: deps.showMain, tray: () => tray }) : null;
    },
    broadcast,
    file: path.join(userData, "tray.json"),
    ipc: deps.ipc,
    log: deps.log
  });

  quick.apply();
  app.on("will-quit", () => {
    quick.dispose();
    tray?.dispose();
  });

  return {
    /** Whether closing the last window should leave Vanta running (macOS always does). */
    keepRunningWithoutWindows: () => setting.isEnabled(),
    mini,
    quick
  };
}

export type ShellExtras = ReturnType<typeof registerShellExtras>;
