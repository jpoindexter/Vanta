const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vantaAvatar", Object.freeze({
  open: () => ipcRenderer.invoke("vanta:avatar-open"),
  hide: () => ipcRenderer.invoke("vanta:avatar-hide"),
  readPhase: () => ipcRenderer.invoke("vanta:avatar-phase"),
  onPhase: (callback) => {
    const listener = (_event, phase) => callback(phase);
    ipcRenderer.on("vanta:avatar-phase-changed", listener);
    return () => ipcRenderer.removeListener("vanta:avatar-phase-changed", listener);
  },
}));
