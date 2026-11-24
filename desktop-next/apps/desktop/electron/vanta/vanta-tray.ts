import type { MenuItemConstructorOptions } from "electron";

export interface TrayState {
  needsYou: number;
  online: boolean;
}

export interface TrayActions {
  quit: () => void;
  showQuickEntry: () => void;
  showVanta: () => void;
  toggleMini: () => void;
}

export const OFFLINE: TrayState = { needsYou: 0, online: false };

/** The tray menu: Show Vanta, Needs you (n), the quick surfaces, Quit. "Needs you" is dead weight at zero, so it is disabled. */
export function buildTrayMenuTemplate(state: TrayState, actions: TrayActions, miniOpen: boolean): MenuItemConstructorOptions[] {
  return [
    { enabled: false, label: `Vanta · ${state.online ? "online" : "offline"}` },
    { click: actions.showVanta, label: "Show Vanta" },
    { click: actions.showVanta, enabled: state.needsYou > 0, label: `Needs you (${state.needsYou})` },
    { type: "separator" },
    { click: actions.showQuickEntry, label: "Quick Entry…" },
    { click: actions.toggleMini, label: miniOpen ? "Close mini window" : "Open mini window" },
    { type: "separator" },
    { click: actions.quit, label: "Quit Vanta" }
  ];
}

/** The Vanta server's answer to "is something waiting for the user", read from the pending-approval route. */
export async function readTrayState(
  request: (call: { method: "GET"; path: string }) => Promise<{ data: unknown; ok: boolean }>
): Promise<TrayState> {
  try {
    const result = await request({ method: "GET", path: "/api/approval" });

    if (!result.ok) {
      return OFFLINE;
    }

    return { needsYou: result.data ? 1 : 0, online: true };
  } catch {
    return OFFLINE;
  }
}

export interface TrayLike {
  destroy: () => void;
  on: (event: "click", listener: () => void) => unknown;
  setContextMenu: (menu: unknown) => void;
  setToolTip: (text: string) => void;
}

export interface TrayHostDeps {
  actions: TrayActions;
  buildMenu: (template: MenuItemConstructorOptions[]) => unknown;
  clearTimer?: (id: unknown) => void;
  createTray: () => TrayLike;
  isMiniOpen: () => boolean;
  intervalMs?: number;
  poll: () => Promise<TrayState>;
  /** Show the count on the dock (macOS) or taskbar; an empty string clears it. */
  setBadge: (text: string) => void;
  startTimer?: (run: () => void, ms: number) => unknown;
}

const POLL_MS = 3000;

/** A menu-bar / system-tray presence that mirrors whether the agent is waiting on the user. */
export function createTrayHost(deps: TrayHostDeps) {
  const tray = deps.createTray();
  let state: TrayState = OFFLINE;
  let disposed = false;

  const render = () => {
    if (disposed) {
      return;
    }

    tray.setContextMenu(deps.buildMenu(buildTrayMenuTemplate(state, deps.actions, deps.isMiniOpen())));
    tray.setToolTip(state.needsYou > 0 ? `Vanta needs you (${state.needsYou})` : "Vanta");
    deps.setBadge(state.needsYou > 0 ? String(state.needsYou) : "");
  };

  const refresh = async () => {
    const next = await deps.poll();

    if (!disposed && (next.needsYou !== state.needsYou || next.online !== state.online)) {
      state = next;
      render();
    }
  };

  tray.on("click", deps.actions.showVanta);
  render();
  void refresh();

  const start = deps.startTimer ?? ((run, ms) => setInterval(run, ms));
  const stop = deps.clearTimer ?? ((id: unknown) => clearInterval(id as NodeJS.Timeout));
  const timer = start(() => void refresh(), deps.intervalMs ?? POLL_MS);

  return {
    /** The menu text depends on the mini window, so it is rebuilt when that opens or closes. */
    rerender: render,
    dispose: () => {
      disposed = true;
      stop(timer);
      deps.setBadge("");
      tray.destroy();
    },
    refresh,
    state: () => state
  };
}

export type TrayHost = ReturnType<typeof createTrayHost>;
