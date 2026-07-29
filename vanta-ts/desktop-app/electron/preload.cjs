const { contextBridge, ipcRenderer, webUtils } = require("electron");

const prefix = "--vanta-desktop-boundary=";
const boundaryToken = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length)
  ?? process.env.VANTA_DESKTOP_BOUNDARY_TOKEN
  ?? "";

contextBridge.exposeInMainWorld("vantaDesktop", Object.freeze({
  boundaryToken,
  readClipboard: () => ipcRenderer.invoke("vanta:read-clipboard"),
  resolveDroppedFiles: (files) => {
    const paths = Array.from(files ?? [], (file) => webUtils.getPathForFile(file)).filter(Boolean);
    return ipcRenderer.invoke("vanta:resolve-dropped-paths", paths);
  },
  pickAttachments: () => ipcRenderer.invoke("vanta:pick-attachments"),
}));
