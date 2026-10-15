import { CH } from "./channels";

/**
 * `vanta://<kind>/<name>?<params>` links. A link can come from any web page, so only kinds that cannot run code
 * are honoured. Links that would install a plugin, skill or MCP server are dropped until they can go through the
 * approval flow.
 */
export const ALLOWED_DEEP_LINK_KINDS: ReadonlySet<string> = new Set(["blueprint", "connections", "session"]);

const MAX_URL_LENGTH = 4096;
const MAX_PARAMS = 20;
const MAX_VALUE_LENGTH = 2000;
const MAX_NAME_LENGTH = 200;
const PENDING_CAP = 20;
const KIND = /^[a-z][a-z0-9-]{0,31}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

export interface DeepLink {
  kind: string;
  name: string;
  params: Record<string, string>;
}

function paramsAreSafe(entries: Array<[string, string]>): boolean {
  return entries.length <= MAX_PARAMS && entries.every(([key, value]) => value.length <= MAX_VALUE_LENGTH && !CONTROL.test(key + value));
}

function urlOf(raw: unknown): null | URL {
  if (typeof raw !== "string" || raw.length > MAX_URL_LENGTH) {
    return null;
  }

  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function parseDeepLink(raw: unknown): DeepLink | null {
  const url = urlOf(raw);

  if (!url || url.protocol !== "vanta:") {
    return null;
  }

  const kind = url.hostname.toLowerCase();
  const name = decodeSegment(url.pathname.split("/").filter(Boolean)[0] ?? "");
  const entries = [...url.searchParams.entries()];

  if (!KIND.test(kind) || !ALLOWED_DEEP_LINK_KINDS.has(kind) || name === null || name.length > MAX_NAME_LENGTH) {
    return null;
  }

  return paramsAreSafe(entries) ? { kind, name, params: Object.fromEntries(entries) } : null;
}

function decodeSegment(segment: string): null | string {
  try {
    const decoded = decodeURIComponent(segment);

    return CONTROL.test(decoded) ? null : decoded;
  } catch {
    return null;
  }
}

export interface DeepLinkDeps {
  focusWindow: () => void;
  send: (channel: string, payload: unknown) => void;
}

/** Holds links that arrive before the renderer is listening, and replays them once it says it is ready. */
export function createDeepLinkRouter({ focusWindow, send }: DeepLinkDeps) {
  const pending: DeepLink[] = [];
  let ready = false;

  const deliver = (link: DeepLink) => {
    if (link.kind === "session" && link.name) {
      send(CH.focusSession, link.name);
    } else {
      send(CH.deepLink, link);
    }
  };

  return {
    handleUrl: (raw: unknown): boolean => {
      const link = parseDeepLink(raw);

      if (!link) {
        return false;
      }

      focusWindow();

      if (ready) {
        deliver(link);
      } else if (pending.length < PENDING_CAP) {
        pending.push(link);
      }

      return true;
    },
    pendingCount: () => pending.length,
    /** Called when the renderer has subscribed; flushes anything that arrived first. */
    markReady: () => {
      ready = true;
      pending.splice(0).forEach(deliver);
    },
    /** The window reloaded or closed: hold new links until it signals again. */
    markNotReady: () => {
      ready = false;
    }
  };
}

export type DeepLinkRouter = ReturnType<typeof createDeepLinkRouter>;

/** A `vanta://` argument from a second-instance command line, if there is one. */
export const deepLinkFromArgv = (argv: readonly string[]): string | undefined =>
  argv.find(arg => typeof arg === "string" && arg.toLowerCase().startsWith("vanta://"));
