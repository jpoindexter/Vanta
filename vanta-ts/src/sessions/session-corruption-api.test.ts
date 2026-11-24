import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDesktopServer } from "../desktop/server.js";
import { loadSession, saveSession } from "./store.js";

describe("session corruption through existing Desktop API", () => {
  let home: string;
  const previous = process.env.VANTA_HOME;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-session-api-recovery-"));
    process.env.VANTA_HOME = home;
  });
  afterEach(async () => {
    if (previous === undefined) delete process.env.VANTA_HOME;
    else process.env.VANTA_HOME = previous;
    await rm(home, { recursive: true, force: true });
  });

  it("keeps healthy history available and returns actionable error when opening corrupted entry", async () => {
    await saveSession("healthy", [{ role: "user", content: "Healthy history" }]);
    await saveSession("damaged", [{ role: "user", content: "Keep suspect bytes" }]);
    const path = join(home, "sessions", "damaged.json");
    await writeFile(path, "{truncated");
    const server = createDesktopServer(home);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server not listening");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      const listed = await fetch(`${base}/api/sessions`);
      expect(listed.status).toBe(200);
      expect(await listed.json()).toMatchObject([
        { id: "healthy", title: "Healthy history" },
        { id: "damaged", diagnostic: { code: "session_store_unreadable", path } },
      ]);
      const opened = await fetch(`${base}/api/sessions/open`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "damaged" }),
      });
      expect(opened.status).toBe(500);
      expect(await opened.json()).toMatchObject({ error: expect.stringContaining(`${path}.last-good`) });
      expect(await readFile(path, "utf8")).toBe("{truncated");
      expect(await loadSession("healthy")).toMatchObject({ id: "healthy", messages: [{ content: "Healthy history" }] });
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
});
