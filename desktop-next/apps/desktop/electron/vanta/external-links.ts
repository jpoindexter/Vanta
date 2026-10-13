import { CH } from "./channels";
import { parseExternalUrl } from "./paths-policy";

export interface ExternalOpenDeps {
  /** Push a message to the main window's renderer. */
  notify: (channel: string, payload: unknown) => void;
  openExternal: (url: string) => Promise<void>;
}

/**
 * Every link that leaves the app (a clicked anchor, window.open, a menu item) passes through here: only http,
 * https and mailto reach the OS, and a failure is reported to the renderer instead of being swallowed.
 */
export function createExternalOpener({ notify, openExternal }: ExternalOpenDeps) {
  return (raw: string): void => {
    const url = parseExternalUrl(raw);

    if (!url) {
      notify(CH.externalOpenFailed, { message: "Vanta only opens web and email links.", url: String(raw).slice(0, 200) });

      return;
    }

    openExternal(url.toString()).catch((error: unknown) =>
      notify(CH.externalOpenFailed, { message: error instanceof Error ? error.message : String(error), url: url.toString() })
    );
  };
}
