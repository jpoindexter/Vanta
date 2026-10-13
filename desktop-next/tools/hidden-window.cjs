// Preloaded into the Electron main process (NODE_OPTIONS=--require) for proof runs:
// windows show inactive and far off-screen, and the app leaves the Dock, so a run never
// takes focus or covers the owner's screen.
const electron = require("electron");

const OFFSCREEN = -4000;

if (electron.app && electron.app.dock) electron.app.dock.hide();

const { BrowserWindow } = electron;
if (BrowserWindow) {
  const show = BrowserWindow.prototype.show;
  BrowserWindow.prototype.show = function hiddenShow(...args) {
    this.setPosition(OFFSCREEN, OFFSCREEN);
    return typeof this.showInactive === "function" ? this.showInactive() : show.apply(this, args);
  };
  BrowserWindow.prototype.focus = function noFocus() {};
}
