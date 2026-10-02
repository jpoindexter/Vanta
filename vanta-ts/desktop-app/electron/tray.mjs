export function createTrayController(deps) {
  const state = { status: "connecting", pending: false, deviceCount: 0, wakeEnabled: false, disposed: false };
  const headers = deps.boundaryToken ? { "x-vanta-desktop-boundary": deps.boundaryToken } : {};
  const ctx = { deps, state, headers, tray: createTray(deps), fetch: deps.fetchImpl ?? fetch };
  const actions = {
    openMain: () => openSurface(ctx, "full"), openQuick: () => openSurface(ctx, "mini"),
    showAvatar: () => Promise.resolve(deps.showAvatar()).catch((error) => showError(ctx, error)),
    pairMobile: () => pairMobile(ctx), toggleWake: () => toggleWake(ctx).then(refresh),
  };
  const rebuild = () => rebuildMenu(ctx, actions);
  const refresh = () => refreshTray(ctx).then(rebuild);
  ctx.tray.on("click", actions.openMain);
  rebuild(); void refresh();
  const interval = setInterval(() => void refresh(), 2000);
  return { tray: ctx.tray, refresh, ...actions, dispose: () => {
    state.disposed = true; clearInterval(interval); ctx.tray.destroy();
  } };
}

function createTray({ Tray, nativeImage, platform = process.platform }) {
  // Use the scalable SF Symbol instead of the heavy NSActionTemplate glyph.
  const icon = platform === "darwin"
    ? nativeImage.createFromNamedImage("ellipsis", { pointSize: 13, weight: "semibold" }) : nativeImage.createEmpty();
  icon.setTemplateImage?.(true);
  const tray = new Tray(icon);
  tray.setToolTip("Vanta");
  return tray;
}

function openSurface(ctx, mode) {
  return ctx.deps.openWorkspace(mode).catch((error) => showError(ctx, error));
}

function showError(ctx, error) {
  return ctx.deps.dialog.showMessageBox({ type: "error", title: "Vanta needs attention", message: error instanceof Error ? error.message : String(error) });
}

async function pairMobile(ctx) {
  try {
    const response = await ctx.fetch(`${ctx.deps.baseUrl}/api/companion/pair/start`, { method: "POST", headers: ctx.headers });
    const pairing = await response.json();
    if (!response.ok) throw new Error(pairing.error ?? "Pairing failed");
    const url = pairing.urls?.[0] ?? "No LAN address found";
    const result = await ctx.deps.dialog.showMessageBox({ type: "info", title: "Pair mobile companion", message: pairing.code,
      detail: `${url}\n\nExpires in 10 minutes.`, buttons: ["Copy URL and code", "Done"], defaultId: 0 });
    if (result.response === 0) ctx.deps.clipboard.writeText(`${url}\n${pairing.code}`);
  } catch (error) { await showError(ctx, error); }
}

async function toggleWake(ctx) {
  try {
    const response = await ctx.fetch(`${ctx.deps.baseUrl}/api/wake`, { method: "POST",
      headers: { "content-type": "application/json", ...ctx.headers }, body: JSON.stringify({ enabled: !ctx.state.wakeEnabled }) });
    const wake = await response.json();
    if (!response.ok) throw new Error(wake.error ?? "Wake-word update failed");
    ctx.state.wakeEnabled = wake.enabled && wake.running;
  } catch (error) { await showError(ctx, error); }
}

function rebuildMenu({ deps, state, tray }, actions) {
  if (state.disposed) return;
  tray.setContextMenu(deps.Menu.buildFromTemplate([
    { label: `Vanta · ${state.status}`, enabled: false },
    { label: "Open Vanta", click: actions.openMain },
    { label: "Quick Ask", click: actions.openQuick },
    { label: "Show Vanta avatar", click: actions.showAvatar },
    { label: state.pending ? "Approval waiting" : "Approvals", click: actions.openQuick },
    { label: "Wake word · Hey Vanta", type: "checkbox", checked: state.wakeEnabled, click: actions.toggleWake },
    { type: "separator" },
    { label: "Pair mobile…", click: actions.pairMobile },
    { label: `${state.deviceCount} paired device${state.deviceCount === 1 ? "" : "s"}`, enabled: false },
    { type: "separator" }, { label: "Quit Vanta", click: () => deps.app.quit() },
  ]));
}

async function refreshTray(ctx) {
  try {
    const responses = await Promise.all(["/status", "/approval", "/companion/info", "/wake"]
      .map((path) => ctx.fetch(`${ctx.deps.baseUrl}/api${path}`, { headers: ctx.headers })));
    if (responses.some((response) => !response.ok)) throw new Error("Desktop status unavailable");
    const [status, approval, info, wake] = await Promise.all(responses.map((response) => response.json()));
    ctx.state.status = status.kernel === "online" ? "online" : "offline";
    ctx.state.pending = Boolean(approval);
    ctx.state.deviceCount = info.devices?.length ?? 0;
    ctx.state.wakeEnabled = wake.enabled && wake.running;
  } catch { ctx.state.status = "offline"; }
}
