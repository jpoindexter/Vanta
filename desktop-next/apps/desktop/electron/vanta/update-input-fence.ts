import { app, BrowserWindow, Menu } from 'electron'

/** A short, approved restart transaction cannot admit another editable window or native-menu mutation. */
export function freezeUpdateInputs(): () => void {
  const previous: Array<{ item: Electron.MenuItem; enabled: boolean }> = []
  const visit = (items: Electron.MenuItem[]) => {
    for (const item of items) {
      if (item.submenu) visit(item.submenu.items)
      else if (!['quit', 'hide', 'hideOthers', 'unhide'].includes(item.role ?? '')) {
        previous.push({ item, enabled: item.enabled }); item.enabled = false
      }
    }
  }
  visit(Menu.getApplicationMenu()?.items ?? [])
  const blockInput = (event: Electron.Event, input: Electron.Input) => {
    if (!(input.meta && ['q', 'h'].includes(input.key.toLowerCase()))) event.preventDefault()
  }
  const contents = BrowserWindow.getAllWindows().map(w => w.webContents)
  contents.forEach(w => w.on('before-input-event', blockInput))
  const newWindows: Array<{ window: BrowserWindow; hide: () => void; wanted: boolean }> = []
  const refuseNewWindow = (_event: Electron.Event, window: BrowserWindow) => {
    // Callers still finish constructing quick-entry/mini windows; destroying here would crash those callers.
    const entry = { window, wanted: false, hide: () => { entry.wanted = true; window.hide() } }
    newWindows.push(entry); contents.push(window.webContents)
    window.webContents.on('before-input-event', blockInput)
    window.on('show', entry.hide)
  }
  app.on('browser-window-created', refuseNewWindow)
  return () => {
    app.removeListener('browser-window-created', refuseNewWindow)
    contents.forEach(w => { if (!w.isDestroyed()) w.removeListener('before-input-event', blockInput) })
    newWindows.forEach(({ window, hide, wanted }) => {
      if (!window.isDestroyed()) { window.removeListener('show', hide); if (wanted) window.showInactive() }
    })
    previous.forEach(({ item, enabled }) => { item.enabled = enabled })
  }
}
