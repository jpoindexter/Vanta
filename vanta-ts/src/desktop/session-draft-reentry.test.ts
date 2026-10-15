import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDesktopServer } from "./server.js";
import type { DesktopState } from "./handlers.js";

describe("never-sent Desktop chat re-entry", () => {
  const originalHome = process.env.VANTA_HOME;
  let directory: string;
  let server: ReturnType<typeof createDesktopServer>;
  let base: string;

  async function start() {
    const state: DesktopState = {
      root: directory,
      setup: { provider: { modelId: () => "fixture", routeInfo: () => ({ provider: "ollama" }) }, registry: { list: () => [] },
        safety: {}, systemPrompt: "Fixture", goals: [] } as never,
    };
    server = createDesktopServer(directory, { sessions: new Map([["draft-client", state]]) });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test listener");
    base = `http://127.0.0.1:${address.port}`;
  }

  const stop = () => new Promise<void>((resolve) => server.close(() => resolve()));
  const post = (path: string, body: unknown = {}) => fetch(`${base}/api/sessions/${path}`, {
    method: "POST", headers: { "content-type": "application/json", "x-session-id": "draft-client" },
    body: JSON.stringify(body),
  });

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "vanta-draft-reentry-"));
    process.env.VANTA_HOME = directory;
    await start();
  });

  afterEach(async () => {
    await stop();
    if (originalHome === undefined) delete process.env.VANTA_HOME;
    else process.env.VANTA_HOME = originalHome;
    await rm(directory, { recursive: true, force: true });
  });

  it("lists and reopens a never-sent draft after the Desktop server restarts", async () => {
    const { id } = await (await post("new")).json() as { id: string };
    expect((await post("draft", { action: "save", id, value: "Unsent across restart" })).status).toBe(200);
    await stop();
    await start();
    const sessions = await (await fetch(`${base}/api/sessions`)).json();
    expect(sessions).toEqual(expect.arrayContaining([expect.objectContaining({ id, turns: 0 })]));
    expect((await post("open", { id })).status).toBe(200);
    expect(await (await post("draft", { action: "load", id })).json()).toEqual({ exists: true, value: "Unsent across restart" });
  });

  it("gives rapid New chat actions distinct identities without overwriting the earlier draft", async () => {
    const first = await (await post("new")).json() as { id: string };
    await post("draft", { action: "save", id: first.id, value: "First draft" });
    const second = await (await post("new")).json() as { id: string };
    expect(second.id).not.toBe(first.id);
    expect(await (await post("draft", { action: "load", id: first.id })).json()).toMatchObject({ value: "First draft" });
  });
});
