import { fsSessionStore } from "./store.js";
import type { SessionStore } from "./interface.js";

/**
 * Resolve the active session store.
 *   VANTA_SESSION_STORE=fs (default) → one JSON file per session under ~/.vanta
 *
 * To back sessions with a DB/remote/encrypted store: implement {@link SessionStore}
 * and add a case here. Consumers depend on the port, not the fs functions.
 */
export function resolveSessionStore(env: NodeJS.ProcessEnv = process.env): SessionStore {
  const which = (env.VANTA_SESSION_STORE ?? "fs").toLowerCase();
  switch (which) {
    case "fs":
    case "default":
      return fsSessionStore;
    default:
      throw new Error(`Unknown VANTA_SESSION_STORE "${which}". Use fs (default).`);
  }
}

// newSessionId is a pure id generator (no I/O) — re-exported for direct use.
export { newSessionId } from "./store.js";
export type { SessionStore, SaveSessionOptions } from "./interface.js";
export type { Session, SessionMeta } from "./store.js";
