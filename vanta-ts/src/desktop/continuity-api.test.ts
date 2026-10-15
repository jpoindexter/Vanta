import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDesktopServer } from "./server.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function started() {
  const root = await mkdtemp(join(tmpdir(), "vanta-continuity-api-"));
  roots.push(root);
  await writeFile(join(root, "brief.md"), "- [ ] Send the outline\n", "utf8");
  const env = { VANTA_HOME: join(root, ".home") } as NodeJS.ProcessEnv;
  const server = createDesktopServer(root, { env });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing address");
  return { root, env, server, base: `http://127.0.0.1:${address.port}` };
}

const post = (base: string, body: unknown) => fetch(`${base}/api/continuity`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-session-id": "continuity-session" },
  body: JSON.stringify(body),
});

describe("desktop continuity API", () => {
  it("drives capture, preview, execution, session refusal, and restart-safe re-entry", async () => {
    const live = await started();
    try {
      const captured = await post(live.base, { action: "capture", text: "Get @brief.md back on track" });
      expect(captured.status).toBe(201);
      const item = await captured.json() as { item: { id: string } };
      const shown = await post(live.base, { action: "show_me", id: item.item.id });
      expect((await shown.json() as { preview: string }).preview).toContain("No project files will change");
      const done = await post(live.base, { action: "do_it", id: item.item.id });
      expect(await done.json()).toMatchObject({ item: { state: "waiting", nextAction: "Send the outline" } });

      const off = await post(live.base, { action: "off", scope: "session" });
      expect(await off.json()).toMatchObject({ support: { refusal: { scope: "session", active: true } } });
      const blocked = await post(live.base, { action: "capture", text: "Do not recommend this" });
      expect(blocked.status).toBe(409);
    } finally {
      await new Promise<void>((resolve) => live.server.close(() => resolve()));
    }

    const restarted = createDesktopServer(live.root, { env: live.env });
    await new Promise<void>((resolve) => restarted.listen(0, "127.0.0.1", resolve));
    const address = restarted.address();
    if (!address || typeof address === "string") throw new Error("missing address");
    try {
      const snapshot = await fetch(`http://127.0.0.1:${address.port}/api/continuity`).then((response) => response.json()) as {
        today: Array<{ nextAction?: string }>;
        reentry?: { action: string };
        support: { refusal: { active: boolean } };
      };
      expect(snapshot.today[0]?.nextAction).toBe("Send the outline");
      expect(snapshot.reentry?.action).toBe("Send the outline");
      expect(snapshot.support.refusal.active).toBe(false);
    } finally {
      await new Promise<void>((resolve) => restarted.close(() => resolve()));
    }
  });

  it.each(["pattern", "global"] as const)("persists %s refusal across a server restart", async (scope) => {
    const live = await started();
    try {
      expect((await post(live.base, { action: "off", scope })).status).toBe(200);
    } finally {
      await new Promise<void>((resolve) => live.server.close(() => resolve()));
    }

    const restarted = createDesktopServer(live.root, { env: live.env });
    await new Promise<void>((resolve) => restarted.listen(0, "127.0.0.1", resolve));
    const address = restarted.address();
    if (!address || typeof address === "string") throw new Error("missing address");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      const snapshot = await fetch(`${base}/api/continuity`).then((response) => response.json());
      expect(snapshot).toMatchObject({ support: { refusal: { active: true, scope } } });
      const blocked = await post(base, { action: "capture", text: "A repeated continuity pattern" });
      expect(blocked.status).toBe(409);
    } finally {
      await new Promise<void>((resolve) => restarted.close(() => resolve()));
    }
  });

  it("leaves unsupported payloads as structured errors", async () => {
    const live = await started();
    try {
      const invalid = await post(live.base, { action: "teleport" });
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toMatchObject({ error: expect.stringContaining("action") });
    } finally {
      await new Promise<void>((resolve) => live.server.close(() => resolve()));
    }
  });
});
