// Open a specific macOS System Settings privacy pane directly, so the operator
// can grant a permission in one click instead of hunting through Settings.
// Used by `vanta voice mic` (Microphone) and `vanta desktop` (Screen Recording
// + Accessibility). Pure URL builder + an injectable `open` runner.

import { execFile } from "node:child_process";

/** The privacy panes Vanta needs the operator to grant. */
export type PrivacyPane = "microphone" | "screen-recording" | "accessibility";

/** The `x-apple.systempreferences:` anchor for each pane. */
const PANE_ANCHOR: Record<PrivacyPane, string> = {
  microphone: "Privacy_Microphone",
  "screen-recording": "Privacy_ScreenCapture",
  accessibility: "Privacy_Accessibility",
};

/** A one-line "why" shown alongside the open action. */
export const PANE_REASON: Record<PrivacyPane, string> = {
  microphone: "so Vanta can hear push-to-talk voice input",
  "screen-recording": "so Vanta can see your screen to act on it",
  accessibility: "so Vanta can move the mouse + type to control the desktop",
};

/** The deep link that opens System Settings straight to `pane`. */
export function privacyPaneUrl(pane: PrivacyPane): string {
  return `x-apple.systempreferences:com.apple.preference.security?${PANE_ANCHOR[pane]}`;
}

/** Injectable launcher (defaults to spawning macOS `open`). */
export type OpenRunner = (url: string) => void;

const realOpen: OpenRunner = (url) => {
  execFile("open", [url], () => {
    /* detached best-effort; failure is reported by the caller's platform check */
  });
};

/** The outcome of trying to open a pane. */
export type OpenPaneResult = { ok: boolean; url: string; message: string };

/**
 * Open the System Settings privacy pane for `pane`. Only acts on macOS; on other
 * platforms it returns `{ ok:false }` with the manual path. Never throws.
 */
export function openPrivacyPane(
  pane: PrivacyPane,
  deps: { open?: OpenRunner; platform?: NodeJS.Platform } = {},
): OpenPaneResult {
  const url = privacyPaneUrl(pane);
  const platform = deps.platform ?? process.platform;
  if (platform !== "darwin") {
    return { ok: false, url, message: `Opening settings panes is macOS-only. Grant ${pane} access manually.` };
  }
  (deps.open ?? realOpen)(url);
  return { ok: true, url, message: `Opened System Settings → ${pane} (${PANE_REASON[pane]}). Toggle Vanta's terminal on.` };
}
