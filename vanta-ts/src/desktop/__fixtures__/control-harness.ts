import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDesktopServer } from "../server.js";

export type ControlHarness = {
  home: string;
  root: string;
  get: (path: string) => Promise<{ status: number; body: any }>;
  post: (path: string, body: unknown, headers?: Record<string, string>) => Promise<{ status: number; body: any }>;
  stop: () => Promise<void>;
};

const KEYS = ["VANTA_HOME", "VANTA_PROFILE_BASE_HOME", "VANTA_PROFILE"] as const;

/** A real desktop server over an isolated VANTA_HOME; never touches the owner's ~/.vanta. */
export async function startControlHarness(options: { listen?: boolean } = {}): Promise<ControlHarness> {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  const home = await mkdtemp(join(tmpdir(), "vanta-control-home-"));
  const root = await mkdtemp(join(tmpdir(), "vanta-control-root-"));
  process.env.VANTA_HOME = home;
  delete process.env.VANTA_PROFILE_BASE_HOME;
  delete process.env.VANTA_PROFILE;
  const server = createDesktopServer(root);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("desktop server did not bind");
  const base = `http://127.0.0.1:${address.port}`;
  // Approval cards ride the caller's event stream, so a stream must be open for the default client.
  const events = new AbortController();
  if (options.listen !== false) {
    const stream = await fetch(`${base}/api/events`, { signal: events.signal });
    void stream.body?.pipeTo(new WritableStream()).catch(() => undefined);
  }
  const read = async (response: Response) => ({ status: response.status, body: await response.json().catch(() => null) });
  return {
    home, root,
    get: async (path) => read(await fetch(`${base}${path}`)),
    post: async (path, body, headers = {}) => read(await fetch(`${base}${path}`, {
      method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
    })),
    stop: async () => {
      events.abort();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      for (const key of KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
      await Promise.all([rm(home, { recursive: true, force: true }), rm(root, { recursive: true, force: true })]);
    },
  };
}

/** Waits for the pending approval card, answers it, and returns the payload the human was shown. */
export async function answerApproval(h: ControlHarness, decision: "allow" | "deny"): Promise<any> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const pending = (await h.get("/api/approval")).body;
    if (pending) {
      await h.post("/api/approval", { id: pending.id, decision });
      return pending;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("no approval was requested within 2s");
}
