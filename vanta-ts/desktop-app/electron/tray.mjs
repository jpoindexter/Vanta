export function createTrayController(deps) {
  const { Tray, Menu, nativeImage, dialog, clipboard, BrowserWindow, app, baseUrl, fetchImpl = fetch } = deps;
  const icon = process.platform === "darwin" ? nativeImage.createFromNamedImage("NSActionTemplate") : nativeImage.createEmpty();
  icon.setTemplateImage?.(true);
  const tray = new Tray(icon);
  tray.setToolTip("Vanta");
  let quickWindow;
  let status = "connecting";
  let pending = false;
  let deviceCount = 0;
  let wakeEnabled = false;

  function openMain() {
    const window = BrowserWindow.getAllWindows().find((item) => item !== quickWindow);
    window?.show(); window?.focus();
  }

  async function openQuick() {
    if (!quickWindow || quickWindow.isDestroyed()) {
      quickWindow = new BrowserWindow({ width: 420, height: 720, minWidth: 360, minHeight: 560, title: "Vanta Companion", backgroundColor: "#090d13", webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
      quickWindow.on("closed", () => { quickWindow = undefined; });
      await quickWindow.loadURL(`${baseUrl}/companion`);
    }
    quickWindow.show(); quickWindow.focus();
  }

  async function pairMobile() {
    try {
      const response = await fetchImpl(`${baseUrl}/api/companion/pair/start`, { method: "POST" });
      const pairing = await response.json();
      if (!response.ok) throw new Error(pairing.error ?? "pairing failed");
      const url = pairing.urls?.[0] ?? "No LAN address found";
      const result = await dialog.showMessageBox({ type: "info", title: "Pair mobile companion", message: pairing.code, detail: `${url}\n\nExpires in 10 minutes.`, buttons: ["Copy URL and code", "Done"], defaultId: 0 });
      if (result.response === 0) clipboard.writeText(`${url}\n${pairing.code}`);
    } catch (error) {
      await dialog.showMessageBox({ type: "error", title: "Companion pairing failed", message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function toggleWake() {
    try {
      const response = await fetchImpl(`${baseUrl}/api/wake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: !wakeEnabled }) });
      const wake = await response.json();
      if (!response.ok) throw new Error(wake.error ?? "wake-word update failed");
      wakeEnabled = wake.enabled && wake.running;
    } catch (error) {
      await dialog.showMessageBox({ type: "error", title: "Wake word failed", message: error instanceof Error ? error.message : String(error) });
    }
    await refresh();
  }

  function rebuild() {
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: `Vanta · ${status}`, enabled: false },
      { label: "Open Vanta", click: openMain },
      { label: "Quick Ask", click: () => void openQuick() },
      { label: pending ? "Approval waiting" : "Approvals", click: () => void openQuick() },
      { label: "Wake word · Hey Vanta", type: "checkbox", checked: wakeEnabled, click: () => void toggleWake() },
      { type: "separator" },
      { label: "Pair mobile…", click: () => void pairMobile() },
      { label: `${deviceCount} paired device${deviceCount === 1 ? "" : "s"}`, enabled: false },
      { type: "separator" },
      { label: "Quit Vanta", click: () => app.quit() },
    ]));
  }

  async function refresh() {
    try {
      const [statusResponse, approvalResponse, infoResponse, wakeResponse] = await Promise.all([
        fetchImpl(`${baseUrl}/api/status`), fetchImpl(`${baseUrl}/api/approval`), fetchImpl(`${baseUrl}/api/companion/info`), fetchImpl(`${baseUrl}/api/wake`),
      ]);
      const [nextStatus, approval, info, wake] = await Promise.all([statusResponse.json(), approvalResponse.json(), infoResponse.json(), wakeResponse.json()]);
      status = nextStatus.kernel === "online" ? "online" : "offline"; pending = !!approval; deviceCount = info.devices?.length ?? 0; wakeEnabled = wake.enabled && wake.running;
    } catch { status = "offline"; }
    rebuild();
  }

  tray.on("click", openMain);
  rebuild();
  void refresh();
  const interval = setInterval(() => void refresh(), 2_000);
  return { tray, refresh, openQuick, pairMobile, toggleWake, dispose: () => { clearInterval(interval); tray.destroy(); quickWindow?.destroy(); } };
}
