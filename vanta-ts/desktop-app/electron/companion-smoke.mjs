import { app, BrowserWindow } from "electron";

app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 390, height: 844, minWidth: 360, minHeight: 560, show: true, title: "Vanta Companion", backgroundColor: "#090d13", webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  await window.loadURL(process.env.VANTA_COMPANION_SMOKE_URL);
}).catch((error) => { console.error(error); app.exit(1); });

app.on("window-all-closed", () => app.quit());
