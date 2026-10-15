// Preloaded into the Electron main process (Electron --require argument) for proof runs:
// windows show inactive, fully transparent and off-screen, and the app leaves the Dock, so a run never
// takes focus or covers the owner's screen.
const electron = require("electron");

const OFFSCREEN = -4000;

if (electron.app && electron.app.dock) electron.app.dock.hide();

const { BrowserWindow } = electron;
if (BrowserWindow) {
  const show = BrowserWindow.prototype.show;
  // macOS keeps a sliver of any window on a screen, so the window is also fully transparent and click-through.
  const conceal = (win) => {
    win.setPosition(OFFSCREEN, OFFSCREEN);
    win.setOpacity(0);
    win.setIgnoreMouseEvents(true);
  };
  BrowserWindow.prototype.show = function hiddenShow(...args) {
    conceal(this);
    return typeof this.showInactive === "function" ? this.showInactive() : show.apply(this, args);
  };
  const showInactive = BrowserWindow.prototype.showInactive;
  BrowserWindow.prototype.showInactive = function hiddenShowInactive(...args) {
    conceal(this);
    return showInactive.apply(this, args);
  };
  // Windows that place themselves (the mini window snaps near the cursor) are moved back off-screen.
  const setPosition = BrowserWindow.prototype.setPosition;
  const setBounds = BrowserWindow.prototype.setBounds;
  const park = (win) => {
    const [x, y] = win.getPosition();
    if (x !== OFFSCREEN || y !== OFFSCREEN) setPosition.call(win, OFFSCREEN, OFFSCREEN);
  };
  BrowserWindow.prototype.setBounds = function parked(...args) {
    const result = setBounds.apply(this, args);
    park(this);
    return result;
  };
  BrowserWindow.prototype.setPosition = function parkedPosition(...args) {
    const result = setPosition.apply(this, args);
    park(this);
    return result;
  };
  BrowserWindow.prototype.focus = function noFocus() {};
}
