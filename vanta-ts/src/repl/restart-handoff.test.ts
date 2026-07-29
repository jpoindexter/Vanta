import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { consumeRestartHandoff, writeRestartHandoff } from "./restart-handoff.js";

describe("restart handoff", () => {
  it("returns a fresh session once and removes the handoff", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-restart-"));
    const dataDir = join(root, ".vanta");
    const now = new Date("2026-07-29T10:00:00.000Z");
    await writeRestartHandoff(dataDir, "session-1", now);

    await expect(consumeRestartHandoff(dataDir, now)).resolves.toBe("session-1");
    await expect(consumeRestartHandoff(dataDir, now)).resolves.toBeNull();
  });

  it("rejects and removes a stale handoff", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-restart-"));
    const dataDir = join(root, ".vanta");
    await writeRestartHandoff(dataDir, "session-old", new Date("2026-07-29T09:00:00.000Z"));

    await expect(consumeRestartHandoff(dataDir, new Date("2026-07-29T10:00:00.000Z"))).resolves.toBeNull();
  });

  it("fails closed on malformed handoff data", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-restart-"));
    const dataDir = join(root, ".vanta");
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, "restart-session.json"), "{\"sessionId\":\"\"}");

    await expect(consumeRestartHandoff(dataDir, new Date())).resolves.toBeNull();
  });
});
