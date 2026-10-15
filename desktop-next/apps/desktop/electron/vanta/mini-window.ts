import { BrowserWindow, screen } from "electron";

import { applyHudElectronOverlay } from "../hud-overlay";
import { defaultHudBounds } from "../hud-geometry";
import { registerHudIpc } from "../hud-ipc";
import { buildHudWindowUrl } from "../hud-url";
import { defaultTranslucencyState } from "../translucency";

import { createMiniWindowController, type MiniHandle, type MiniWindowController } from "./mini-window-controller";
import { lockNavigation, secureWebPreferences } from "./window-host";

const MIN_WIDTH = 380;
const MIN_HEIGHT = 160;
const TITLE = "Vanta mini window";

export interface MiniWindowDeps {
  devServer?: string;
  getMainWindow: () => BrowserWindow | null;
  isRenderer: (url: string) => boolean;
  openExternal: (url: string) => void;
  preloadPath: string;
  /** Absolute path of the built renderer's index.html, used when there is no dev server. */
  rendererIndexPath: string;
}

const workArea = () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;

function spawn(deps: MiniWindowDeps, sessionId: null | string): BrowserWindow {
  const isMac = process.platform === "darwin";

  const win = new BrowserWindow({
    ...defaultHudBounds(workArea()),
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    enableLargerThanScreen: true,
    frame: false,
    fullscreenable: false,
    hasShadow: false,
    hiddenInMissionControl: isMac,
    maximizable: false,
    minHeight: MIN_HEIGHT,
    minWidth: MIN_WIDTH,
    minimizable: false,
    movable: true,
    // Not resizable: a transparent frameless window grows a few pixels per drag if the OS owns its edges.
    // The renderer's own handles resize it through hud.setBounds.
    resizable: false,
    roundedCorners: true,
    show: false,
    skipTaskbar: !isMac,
    title: TITLE,
    transparent: true,
    visualEffectState: "active",
    webPreferences: secureWebPreferences(deps.preloadPath)
  });

  applyHudElectronOverlay(win, process.platform);
  lockNavigation(win, deps.isRenderer, deps.openExternal);
  win.once("ready-to-show", () => {
    win.show();
    win.focus();
  });
  void win.loadURL(
    buildHudWindowUrl(sessionId, { devServer: deps.devServer, rendererIndexPath: deps.rendererIndexPath })
  );

  return win;
}

const broadcast = (channel: string, payload: unknown): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  }
};

/**
 * The mini window: a small frameless always-on-top window running the renderer's HUD variant, driven by the
 * same hud.* members the Hermes HUD used. The game overlay and the modifier-key gesture are not ported.
 */
export function registerMiniWindow(deps: MiniWindowDeps): MiniWindowController {
  let live: BrowserWindow | null = null;

  const controller = createMiniWindowController({
    broadcast,
    mainWindow: () => deps.getMainWindow(),
    recenter: handle => {
      const window = live;

      if (window && !window.isDestroyed() && handle) {
        window.setResizable(true);
        window.setBounds(defaultHudBounds(workArea()) as Electron.Rectangle);
        window.setResizable(false);
      }
    },
    spawn: sessionId => {
      live = spawn(deps, sessionId);
      const window = live;

      return {
        close: () => window.close(),
        focus: () => window.focus(),
        isDestroyed: () => window.isDestroyed(),
        once: (event, listener) => window.once(event, listener),
        send: (channel, ...args) => window.webContents.send(channel, ...args)
      } satisfies MiniHandle;
    }
  });

  registerHudIpc({
    closeHudWindow: controller.close,
    getHudWindow: () => (controller.isOpen() ? live : null),
    getTranslucencyState: () => defaultTranslucencyState("dark", false, process.platform === "win32"),
    isMac: process.platform === "darwin",
    openHudWindow: (sessionId: null | string) => controller.open(sessionId),
    resetHudLayout: controller.recenter,
    setHudSessionId: controller.recordSession
  });

  return controller;
}
