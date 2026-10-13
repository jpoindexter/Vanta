import { type IpcRendererLike, subscribe } from "./bridge-core";
import { CH } from "./channels";

/** What the renderer is told about window moving on this OS (macOS moves the HUD from the page). */
export interface HudWindowingView {
  clientPlacement: boolean;
  controlDrag: boolean;
  nativeDrag: boolean;
  solid: boolean;
  workspaceTransfer: boolean;
}

export const DEFAULT_HUD_WINDOWING: HudWindowingView = {
  clientPlacement: true,
  controlDrag: false,
  nativeDrag: false,
  solid: false,
  workspaceTransfer: false
};

export interface MiniEnv {
  hudWindowing?: HudWindowingView;
  ipc: IpcRendererLike;
}

/** The mini window's controls. The cursor feed and the game overlay are not ported and stay unsupported. */
function hudApi({ hudWindowing = DEFAULT_HUD_WINDOWING, ipc }: MiniEnv) {
  return {
    hud: {
      beginMove: () => ipc.send(CH.hudBeginMove),
      close: () => ipc.invoke(CH.hudClose),
      endMove: () => ipc.send(CH.hudEndMove),
      moveBy: (delta: unknown) => ipc.send(CH.hudMoveBy, delta),
      nativeDrag: hudWindowing.nativeDrag,
      onChanged: (callback: (state: unknown) => void) => subscribe(ipc, CH.hudChanged, callback),
      onGoto: (callback: (sessionId: string) => void) => subscribe(ipc, CH.hudGoto, callback),
      open: (request?: unknown) => ipc.invoke(CH.hudOpen, request),
      resetLayout: () => ipc.invoke(CH.hudResetLayout),
      setBounds: (bounds: unknown) => ipc.send(CH.hudSetBounds, bounds),
      setFrost: (showing: boolean) => ipc.invoke(CH.hudFrost, showing),
      setIgnoreMouse: (ignore: boolean) => ipc.send(CH.hudIgnoreMouse, ignore),
      setSession: (sessionId: null | string) => ipc.send(CH.hudSession, sessionId),
      setWorkspaceTransfer: (transferring: boolean) => ipc.send(CH.hudWorkspaceTransfer, transferring),
      windowing: { ...hudWindowing }
    }
  };
}

function quickEntryApi({ ipc }: MiniEnv) {
  return {
    quickEntry: {
      ackSubmit: (correlationId: string, result: unknown) => ipc.send(CH.quickAck, { correlationId, result }),
      dismiss: () => ipc.send(CH.quickDismiss),
      getSettings: () => ipc.invoke(CH.quickSettingsGet),
      onLateResult: (callback: (payload: unknown) => void) => subscribe(ipc, CH.quickLateResult, callback),
      onShown: (callback: () => void) => subscribe(ipc, CH.quickShown, callback),
      onState: (callback: (payload: unknown) => void) => subscribe(ipc, CH.quickState, callback),
      onSubmit: (callback: (payload: unknown) => void) => subscribe(ipc, CH.quickSubmitToMain, callback),
      pushState: (payload: unknown) => ipc.send(CH.quickState, payload),
      setSettings: (patch: unknown) => ipc.invoke(CH.quickSettingsSet, patch),
      submit: (payload: unknown) => ipc.invoke(CH.quickSubmit, payload)
    }
  };
}

function trayApi({ ipc }: MiniEnv) {
  return {
    minimizeToTray: {
      get: () => ipc.invoke(CH.trayGet),
      onChanged: (callback: (status: unknown) => void) => subscribe(ipc, CH.trayChanged, callback),
      set: (on: boolean) => ipc.invoke(CH.traySet, on)
    }
  };
}

export function miniWindowApi(env: MiniEnv) {
  return { ...hudApi(env), ...quickEntryApi(env), ...trayApi(env) };
}
