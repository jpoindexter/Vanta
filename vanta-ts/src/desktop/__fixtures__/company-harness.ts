import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { freshState, headers, startServer, type TestServer } from "./sse-harness.js";
import type { DesktopState } from "../handler-state.js";

// Real stores in a temp VANTA_HOME plus a real desktop server. No engine mocks:
// the only injected thing is the worker runtime (company-ports).

export type CompanyHarness = {
  home: string;
  root: string;
  server: TestServer;
  sessions: Map<string, DesktopState>;
  get: (path: string, sid?: string) => Promise<{ status: number; body: any }>;
  post: (path: string, body: unknown, sid?: string) => Promise<{ status: number; body: any }>;
  close: () => Promise<void>;
};

const SID = "company-test";

export async function startCompanyHarness(): Promise<CompanyHarness> {
  const home = await mkdtemp(join(tmpdir(), "vanta-company-home-"));
  const root = await mkdtemp(join(tmpdir(), "vanta-company-root-"));
  const previous = process.env.VANTA_HOME;
  process.env.VANTA_HOME = home;
  const sessions = new Map([[SID, freshState(SID, root)]]);
  const server = await startServer(root, sessions);
  const url = (path: string): string => `http://127.0.0.1:${server.port}${path}`;
  const call = async (method: string, path: string, body: unknown, sid: string) => {
    const response = await fetch(url(path), { method, headers: headers(sid), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  return {
    home, root, server, sessions,
    get: (path, sid = SID) => call("GET", path, undefined, sid),
    post: (path, body, sid = SID) => call("POST", path, body, sid),
    close: async () => {
      await server.close();
      if (previous === undefined) delete process.env.VANTA_HOME; else process.env.VANTA_HOME = previous;
      await Promise.all([rm(home, { recursive: true, force: true }), rm(root, { recursive: true, force: true })]);
    },
  };
}

export const COMPANY_SID = SID;
