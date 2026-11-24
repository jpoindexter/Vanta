import { CH } from "./channels";

/** The slice of a BrowserWindow the mini-window lifecycle needs; a fake in tests. */
export interface MiniHandle {
  close: () => void;
  focus: () => void;
  isDestroyed: () => boolean;
  once: (event: "closed", listener: () => void) => unknown;
  send: (channel: string, ...args: unknown[]) => void;
}

export interface MainWindowLike {
  focus: () => void;
  hide: () => void;
  isDestroyed: () => boolean;
  isVisible: () => boolean;
  restore: () => void;
  show: () => void;
}

export interface MiniDeps {
  /** Tell every window whether the mini window is up. */
  broadcast: (channel: string, payload: unknown) => void;
  mainWindow: () => MainWindowLike | null;
  /** Re-centre the window at its default size. */
  recenter: (handle: MiniHandle) => void;
  spawn: (sessionId: null | string) => MiniHandle;
}

/**
 * The compact always-on-top window that stands in for the Vanta HUD: the renderer's HUD variant, driven by
 * the same hud.* members. Opening it steps the main window aside, closing it brings the main window back, and
 * every window is told which way it went so the toggle always reads the truth.
 */
export class MiniWindowController {
  private current: MiniHandle | null = null;
  private session: null | string = null;
  private restoreMain = false;

  constructor(private readonly deps: MiniDeps) {}

  isOpen = (): boolean => Boolean(this.current && !this.current.isDestroyed());

  handle = (): MiniHandle | null => (this.isOpen() ? this.current : null);

  sessionId = (): null | string => this.session;

  /** The renderer reporting which conversation it shows, so closing hands it back. */
  recordSession = (next: null | string): void => {
    this.session = next;
  };

  recenter = (): boolean => {
    if (this.current && !this.current.isDestroyed()) {
      this.deps.recenter(this.current);

      return true;
    }

    return false;
  };

  toggle = (): void => (this.isOpen() ? this.current?.close() : this.open(null));

  close = (): void => {
    if (this.current && !this.current.isDestroyed()) {
      this.current.close();

      return;
    }

    this.current = null;
    this.bringMainBack();
    this.announce(false);
  };

  open = (requested: null | string): void => {
    if (this.isOpen()) {
      this.pointAt(requested);

      return;
    }

    this.stepMainAside();
    this.session = requested;
    const handle = this.deps.spawn(requested);
    this.current = handle;

    handle.once("closed", () => {
      // A replacement may already own the slot; only the live window tears down.
      if (this.current === handle) {
        this.current = null;
        this.bringMainBack();
        this.announce(false);
      }
    });

    this.announce(true);
  };

  private pointAt(requested: null | string): void {
    if (requested && requested !== this.session) {
      this.session = requested;
      this.current?.send(CH.hudGoto, requested);
      this.announce(true);
    }

    this.current?.focus();
  }

  private announce(open: boolean): void {
    this.deps.broadcast(CH.hudChanged, { open, sessionId: this.session });
  }

  private stepMainAside(): void {
    const main = this.deps.mainWindow();

    this.restoreMain = Boolean(main && !main.isDestroyed() && main.isVisible());

    if (this.restoreMain) {
      main?.hide();
    }
  }

  private bringMainBack(): void {
    const main = this.deps.mainWindow();

    if (this.restoreMain && main && !main.isDestroyed()) {
      main.show();
      main.focus();
    }

    this.restoreMain = false;
  }
}

export const createMiniWindowController = (deps: MiniDeps): MiniWindowController => new MiniWindowController(deps);
