import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAmbientScreen, runAmbientScreenTick, saveAmbientScreen, setAmbientEnabled } from "./screen-context.js";

describe("ambient screen context", () => {
  it("is opt-in, redacts context, proposes an approval-gated action, and throttles", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-ambient-"));
    try {
      expect((await runAmbientScreenTick(dir, "tests failed")).ran).toBe(false);
      await setAmbientEnabled(dir, true, 300);
      await saveAmbientScreen(dir, { ...await loadAmbientScreen(dir), redact: ["secret-app"] });
      const first = await runAmbientScreenTick(dir, "secret-app tests failed", new Date("2026-07-09T10:00:00.000Z"));
      expect(first).toMatchObject({ ran: true, proposal: "Fix failing tests", lane: "queues-for-approval" });
      expect((await loadAmbientScreen(dir)).lastContext).toContain("[redacted]");
      const second = await runAmbientScreenTick(dir, "tests failed again", new Date("2026-07-09T10:01:00.000Z"));
      expect(second.reason).toBe("ambient screen throttled");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
