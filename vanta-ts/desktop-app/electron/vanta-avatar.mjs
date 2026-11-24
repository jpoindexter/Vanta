import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** No server, credentials, transcript, microphone or screen access in this surface. */
export function createVantaAvatar({ BrowserWindow, screen }) {
  let window;
  let phase = "connecting";
  async function show() {
    if (!window || window.isDestroyed()) {
      const area = screen.getPrimaryDisplay().workArea;
      window = new BrowserWindow({
        x: area.x + area.width - 144, y: area.y + area.height - 156, width: 124, height: 128,
        frame: false, transparent: true, resizable: false, maximizable: false, fullscreenable: false,
        alwaysOnTop: true, skipTaskbar: true, show: false, title: "Vanta avatar",
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true,
          preload: join(dirname(fileURLToPath(import.meta.url)), "avatar-preload.cjs") },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event) => event.preventDefault());
      window.on("closed", () => { window = undefined; });
      await window.loadFile(join(dirname(fileURLToPath(import.meta.url)), "avatar.html"));
    }
    window.show(); window.focus();
  }
  return {
    show, phase: () => phase,
    owns: (sender) => Boolean(window && !window.isDestroyed() && sender === window.webContents),
    setPhase(next) { phase = next; if (window && !window.isDestroyed()) window.webContents.send("vanta:avatar-phase-changed", next); },
    hide: () => window?.hide(),
    dispose: () => window?.destroy(),
  };
}
