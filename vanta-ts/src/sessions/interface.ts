import type { Message } from "../types.js";
import type { Session, SessionMeta } from "./store.js";

export type SaveSessionOptions = {
  env?: NodeJS.ProcessEnv;
  now?: string;
  started?: string;
  title?: string;
};

/**
 * The session-store PORT — persistence for conversation sessions. Consumers
 * depend on this interface and resolve the active store via resolveSessionStore
 * (sessions/index.ts). The default fs-JSON store is one adapter; a DB/remote/
 * encrypted store just implements this. (ports/adapters, DECISIONS 2026-06-17.)
 */
export interface SessionStore {
  saveSession(id: string, messages: Message[], opts?: SaveSessionOptions): Promise<void>;
  loadSession(id: string, env?: NodeJS.ProcessEnv): Promise<Session | null>;
  forkSession(sourceId: string, opts?: { env?: NodeJS.ProcessEnv; now?: Date }): Promise<Session | null>;
  deleteSession(id: string, env?: NodeJS.ProcessEnv): Promise<void>;
  listSessions(env?: NodeJS.ProcessEnv): Promise<SessionMeta[]>;
}

export type { Session, SessionMeta } from "./store.js";
