import { Menu } from "electron";

/** Application menu; actions are injected so this module owns no window state. */
export function buildApplicationMenu({ app, chooseProject, getPresence, toggleDeveloperTools }) {
  const template = [
    { label: "Vanta", submenu: [
      { label: "About Vanta", role: "about" }, { type: "separator" },
      { label: "Open Project…", accelerator: "CmdOrCtrl+O", click: () => { void chooseProject(); } },
      { label: "Show Vanta", accelerator: "CmdOrCtrl+Shift+V", click: () => { void getPresence()?.setMode("full"); } },
      { label: "Mini Vanta", click: () => { void getPresence()?.setMode("mini"); } },
      { label: "Show Vanta avatar", click: () => { void getPresence()?.showAvatar(); } },
      { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" },
    ] },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "View", submenu: [{ role: "reload" }, { label: "Developer Tools", accelerator: process.platform === "darwin" ? "Alt+Command+I" : "Ctrl+Shift+I", visible: !app.isPackaged, click: () => toggleDeveloperTools() }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "togglefullscreen" }] },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "front" }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
