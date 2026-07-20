const { contextBridge, ipcRenderer } = require("electron");

const prefix = "--vanta-desktop-boundary=";
const boundaryToken = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length)
  ?? process.env.VANTA_DESKTOP_BOUNDARY_TOKEN
  ?? "";

contextBridge.exposeInMainWorld("vantaDesktop", Object.freeze({
  boundaryToken,
  readClipboard: () => ipcRenderer.invoke("vanta:read-clipboard"),
}));
