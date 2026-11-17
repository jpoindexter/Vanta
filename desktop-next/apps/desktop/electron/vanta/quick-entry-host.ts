import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  createQuickEntryShortcut,
  createQuickEntrySubmitRelay,
  type GlobalShortcutLike,
  quickEntryWindowBounds,
  sanitizeQuickEntrySettings
} from "../quick-entry";

import { CH } from "./channels";
import type { IpcLike } from "./native-handlers";

const MAX_TEXT = 20_000;
const MAX_SESSIONS = 20;
const MAIN_READY_WAIT_MS = 10_000;

const submitSchema = z.object({ target: z.string().max(200), text: z.string().trim().min(1).max(MAX_TEXT) }).strict();
const settingsPatch = z.object({ enabled: z.boolean().optional(), shortcut: z.string().max(64).optional() }).strict();
const stateSchema = z.object({
  connected: z.boolean(),
  sessions: z.array(z.object({ id: z.string().max(200), title: z.string().max(300) })).max(MAX_SESSIONS)
});
const ackSchema = z.object({
  correlationId: z.string().max(64),
  result: z.object({ ok: z.boolean() }).passthrough()
});

/** The slice of a BrowserWindow the quick-entry host drives; a fake in tests. */
export interface QuickWindowLike {
  focus: () => void;
  hide: () => void;
  isDestroyed: () => boolean;
  isVisible: () => boolean;
  setBounds: (bounds: { height: number; width: number; x: number; y: number }) => void;
  show: () => void;
  webContents: { send: (channel: string, ...args: unknown[]) => void };
}

export interface QuickEntryDeps {
  /** Make sure the main window exists and is showing, resolving once its renderer has announced it is ready. */
  ensureMain: () => Promise<null | { webContents: unknown }>;
  getMainContents: () => unknown;
  globalShortcut: GlobalShortcutLike;
  ipc: IpcLike;
  log: (line: string) => void;
  /** Create the frameless quick window (hidden). Called once, on first summon. */
  openQuickWindow: () => QuickWindowLike;
  settingsFile: string;
  workArea: () => { height: number; width: number; x: number; y: number };
}

function readSettings(file: string) {
  try {
    return sanitizeQuickEntrySettings(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return sanitizeQuickEntrySettings(undefined);
  }
}

/**
 * Quick Entry: a global shortcut opens a small composer. What is typed there never reaches the agent from this
 * window; it goes to the main window's own prompt pipeline, which is the same one the normal composer uses, and
 * only that window can acknowledge it. Only the quick window may submit, only the main window may answer or push state.
 */
export class QuickEntryHost {
  private quick: null | QuickWindowLike = null;
  private latestState: unknown = { connected: false, sessions: [] };
  private readonly mainSignals: Array<() => void> = [];
  private readonly shortcut;
  private readonly relay;

  constructor(private readonly deps: QuickEntryDeps) {
    this.shortcut = createQuickEntryShortcut(deps.globalShortcut, () => this.show());
    this.relay = createQuickEntrySubmitRelay({
      onLateResult: (correlationId, result) => this.quick?.webContents.send(CH.quickLateResult, { correlationId, result }),
      onSuccess: () => this.quick?.hide()
    });
    this.registerSettings();
    this.registerSubmit();
    this.registerChannels();
  }

  apply = () => this.shortcut.apply(readSettings(this.deps.settingsFile));

  dispose = (): void => this.shortcut.dispose();

  /** Resolves when the main renderer next reports its state, i.e. its quick-entry bridge is listening. */
  mainReady = (): Promise<void> =>
    new Promise(resolve => {
      const timer = setTimeout(resolve, MAIN_READY_WAIT_MS);
      this.mainSignals.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });

  show = (): void => {
    const quick = this.quick && !this.quick.isDestroyed() ? this.quick : this.deps.openQuickWindow();

    this.quick = quick;
    quick.setBounds(quickEntryWindowBounds(this.deps.workArea()));
    quick.show();
    quick.focus();
    quick.webContents.send(CH.quickShown);
    quick.webContents.send(CH.quickState, this.latestState);
  };

  private fromMain(sender: unknown): boolean {
    return sender === this.deps.getMainContents();
  }

  private fromQuick(sender: unknown): boolean {
    return Boolean(this.quick && !this.quick.isDestroyed() && sender === this.quick.webContents);
  }

  private describeState() {
    const settings = readSettings(this.deps.settingsFile);
    const live = this.shortcut.current();

    return { enabled: settings.enabled, error: live.error, registered: live.registered, shortcut: settings.enabled ? live.shortcut : settings.shortcut };
  }

  private registerSettings(): void {
    const { ipc } = this.deps;

    ipc.handle(CH.quickSettingsGet, () => this.describeState());

    ipc.handle(CH.quickSettingsSet, (_event, raw: unknown) => {
      const patch = settingsPatch.safeParse(raw);

      if (patch.success) {
        this.saveSettings({ ...readSettings(this.deps.settingsFile), ...patch.data });
      }

      this.apply();

      return this.describeState();
    });
  }

  private saveSettings(candidate: unknown): void {
    const next = sanitizeQuickEntrySettings(candidate);

    try {
      mkdirSync(path.dirname(this.deps.settingsFile), { recursive: true });
      writeFileSync(this.deps.settingsFile, JSON.stringify(next), "utf8");
    } catch (error) {
      this.deps.log(`[quick-entry] could not save settings: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private registerSubmit(): void {
    this.deps.ipc.handle(CH.quickSubmit, async (event, raw: unknown) => {
      const parsed = submitSchema.safeParse(raw);

      if (!this.fromQuick(event.sender) || !parsed.success) {
        return { code: "refused", message: "That prompt could not be sent.", ok: false, retryable: false };
      }

      const main = await this.deps.ensureMain();

      if (!main) {
        return { code: "no-window", message: "Vanta could not open its window.", ok: false, retryable: true };
      }

      const target = main.webContents as { send: (channel: string, ...args: unknown[]) => void };

      return this.relay.begin(correlationId => target.send(CH.quickSubmitToMain, { correlationId, ...parsed.data }));
    });
  }

  private registerChannels(): void {
    const { ipc } = this.deps;

    ipc.on(CH.quickAck, (event, raw: unknown) => {
      const parsed = ackSchema.safeParse(raw);

      if (this.fromMain(event.sender) && parsed.success) {
        this.relay.acknowledge(parsed.data.correlationId, parsed.data.result);
      }
    });

    ipc.on(CH.quickDismiss, event => {
      if (this.fromQuick(event.sender)) {
        this.quick?.hide();
      }
    });

    ipc.on(CH.quickState, (event, raw: unknown) => {
      const parsed = stateSchema.safeParse(raw);

      if (this.fromMain(event.sender) && parsed.success) {
        this.latestState = parsed.data;
        this.mainSignals.splice(0).forEach(signal => signal());

        if (this.quick && !this.quick.isDestroyed()) {
          this.quick.webContents.send(CH.quickState, this.latestState);
        }
      }
    });
  }
}

export const registerQuickEntry = (deps: QuickEntryDeps): QuickEntryHost => new QuickEntryHost(deps);
