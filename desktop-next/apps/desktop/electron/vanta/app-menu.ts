import type { BrowserWindow, MenuItemConstructorOptions } from "electron";

import { windowMenuTemplate } from "../window-menu";

import { CH } from "./channels";

export const DOCS_URL = "https://docs.vanta.theft.studio";

export interface MenuDeps {
  appName: string;
  /** Opens a web page in the OS browser, through the same URL check as every other external link. */
  openExternal: (url: string) => void;
  platform: NodeJS.Platform;
  reload: (window: BrowserWindow | null | undefined) => void;
  /** Push a message to the renderer of the focused window. */
  sendToRenderer: (channel: string) => void;
  toggleDevTools: (window: BrowserWindow | null | undefined) => void;
  zoom: { in: () => void; out: () => void; reset: () => void };
}

const appMenu = (deps: MenuDeps): MenuItemConstructorOptions => ({
  label: deps.appName,
  submenu: [
    { label: `About ${deps.appName}`, role: "about" },
    { type: "separator" },
    { role: "services" },
    { type: "separator" },
    { role: "hide" },
    { role: "hideOthers" },
    { role: "unhide" },
    { type: "separator" },
    { role: "quit" }
  ]
});

// File items carry no accelerator: ⌘O and ⌘W are rebindable renderer keybinds, and a menu accelerator would
// claim the chord before the renderer sees it. The items are here so the actions can be found.
const fileMenu = (deps: MenuDeps): MenuItemConstructorOptions => ({
  label: "File",
  submenu: [
    { click: () => deps.sendToRenderer(CH.openFolderRequested), label: "Open Folder…" },
    { type: "separator" },
    deps.platform === "darwin"
      ? { click: () => deps.sendToRenderer(CH.closePreviewRequested), label: "Close" }
      : { role: "quit" }
  ]
});

const editMenu = (deps: MenuDeps): MenuItemConstructorOptions => ({
  label: "Edit",
  submenu: [
    { role: "undo" },
    { role: "redo" },
    { type: "separator" },
    { role: "cut" },
    { role: "copy" },
    { role: "paste" },
    { role: "pasteAndMatchStyle" },
    { role: "delete" },
    { role: "selectAll" },
    ...(deps.platform === "darwin"
      ? ([
          { type: "separator" },
          {
            label: "Substitutions",
            submenu: [{ role: "showSubstitutions" }, { type: "separator" }, { role: "toggleTextReplacement" }]
          }
        ] satisfies MenuItemConstructorOptions[])
      : [])
  ]
});

const viewMenu = (deps: MenuDeps): MenuItemConstructorOptions => ({
  label: "View",
  submenu: [
    { click: (_item, window) => deps.reload(window as BrowserWindow), label: "Reload" },
    { role: "forceReload" },
    {
      accelerator: deps.platform === "darwin" ? "Alt+Cmd+I" : "Ctrl+Shift+I",
      click: (_item, window) => deps.toggleDevTools(window as BrowserWindow),
      label: "Toggle Developer Tools"
    },
    { type: "separator" },
    { accelerator: "CommandOrControl+0", click: deps.zoom.reset, label: "Actual Size" },
    { accelerator: "CommandOrControl+Plus", click: deps.zoom.in, label: "Zoom In" },
    // US keyboards type Plus as Shift+=; the unshifted chord is a hidden twin so both zoom in.
    { accelerator: "CommandOrControl+=", click: deps.zoom.in, label: "Zoom In", visible: false },
    { accelerator: "CommandOrControl+-", click: deps.zoom.out, label: "Zoom Out" },
    { type: "separator" },
    { role: "togglefullscreen" }
  ]
});

const helpMenu = (deps: MenuDeps): MenuItemConstructorOptions => ({
  label: "Help",
  role: "help",
  submenu: [{ click: () => deps.openExternal(DOCS_URL), label: `${deps.appName} Docs` }]
});

/** Vanta's application menu: About, standard Edit roles, View with zoom and DevTools, Window and Help. */
export function buildAppMenuTemplate(deps: MenuDeps): MenuItemConstructorOptions[] {
  return [
    ...(deps.platform === "darwin" ? [appMenu(deps)] : []),
    fileMenu(deps),
    editMenu(deps),
    viewMenu(deps),
    windowMenuTemplate(deps.platform === "darwin"),
    helpMenu(deps)
  ];
}
