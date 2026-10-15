import { createDesktopSurface } from "./desktop-surface.mjs";
import { createVantaAvatar } from "./vanta-avatar.mjs";

const phases = ["connecting", "ready", "working", "needs-you"];

export function createDesktopPresence(deps) {
  const surface = createDesktopSurface({ getWindow: deps.getWindow, screen: deps.screen,
    onMode: (mode) => deps.getWindow()?.webContents.send("vanta:surface-mode-changed", mode) });
  const avatar = createVantaAvatar(deps);
  registerPresenceBridge({ ipcMain: deps.ipcMain, getWindow: deps.getWindow, surface, avatar });
  return { ...surface, showAvatar: avatar.show, dispose: avatar.dispose, reset: () => avatar.setPhase("connecting") };
}

export function registerPresenceBridge({ ipcMain, getWindow, surface, avatar }) {
  const mainOnly = (event) => {
    const contents = getWindow()?.webContents;
    if (event.sender !== contents || (event.senderFrame && event.senderFrame !== contents?.mainFrame)) {
      throw new Error("Untrusted desktop surface request");
    }
  };
  const avatarOnly = (event) => { if (!avatar.owns(event.sender)) throw new Error("Untrusted avatar request"); };
  ipcMain.handle("vanta:surface-mode", (event) => { mainOnly(event); return surface.mode(); });
  ipcMain.handle("vanta:set-surface-mode", (event, mode) => {
    mainOnly(event);
    if (mode !== "full" && mode !== "mini") throw new Error("Invalid desktop mode");
    return surface.setMode(mode);
  });
  ipcMain.handle("vanta:surface-phase", (event, phase) => {
    mainOnly(event);
    if (!phases.includes(phase)) throw new Error("Invalid desktop phase");
    avatar.setPhase(phase);
  });
  ipcMain.handle("vanta:avatar-phase", (event) => { avatarOnly(event); return avatar.phase(); });
  ipcMain.handle("vanta:avatar-open", (event) => { avatarOnly(event); return surface.setMode("mini"); });
  ipcMain.handle("vanta:avatar-hide", (event) => { avatarOnly(event); avatar.hide(); });
}
