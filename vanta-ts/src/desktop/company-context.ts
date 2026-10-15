import { join } from "node:path";
import { resolveVantaHome } from "../store/home.js";
import { companyPorts, type CompanyPorts } from "./company-ports.js";
import type { DesktopState } from "./handler-state.js";
import type { TypedEventHost } from "./typed-emit.js";

/** Everything a company handler needs, resolved once per request. */
export type CompanyCtx = {
  state: DesktopState;
  env: NodeJS.ProcessEnv;
  root: string;
  /** Project data dir (tickets, budgets, spend ledger, heartbeat runs). */
  dataDir: string;
  /** Vanta home (team, tasks, work products, departments, company logs). */
  home: string;
  ports: CompanyPorts;
  /**
   * Snapshot of the requesting client's SSE channel. Background runs keep
   * emitting to the client that started them after the HTTP response is sent.
   */
  host: TypedEventHost;
};

export function companyCtx(state: DesktopState): CompanyCtx {
  const env = state._env ?? process.env;
  return {
    state,
    env,
    root: state.root,
    dataDir: join(state.root, ".vanta"),
    home: resolveVantaHome(env),
    ports: companyPorts(),
    host: { _sseClients: state._sseClients, _sseSessionId: state._sseSessionId },
  };
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

export function fail(status: number, error: string): { ok: false; status: number; error: string } {
  return { ok: false, status, error };
}

export function succeed<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}
