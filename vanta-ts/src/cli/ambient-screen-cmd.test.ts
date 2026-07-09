import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAmbientScreenCommand } from "./ambient-screen-cmd.js";

describe("runAmbientScreenCommand", () => {
  it("enables, redacts, ticks, and disables ambient screen mode", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-ambient-cli-"));
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((line = "") => { logs.push(String(line)); });
    try {
      expect(await runAmbientScreenCommand(root, ["enable", "--interval-sec", "1"])).toBe(0);
      expect(await runAmbientScreenCommand(root, ["redact", "SecretWindow"])).toBe(0);
      expect(await runAmbientScreenCommand(root, ["tick", "--context", "SecretWindow build failed"])).toBe(0);
      expect(await runAmbientScreenCommand(root, ["disable"])).toBe(0);
      expect(logs.join("\n")).toContain("ambient proposal: Fix failing tests");
      expect(logs.join("\n")).toContain("disabled");
    } finally {
      spy.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("looks at the active app/window and offers a next step", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-ambient-cli-"));
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((line = "") => { logs.push(String(line)); });
    try {
      expect(await runAmbientScreenCommand(root, ["look"], {
        collectActiveContext: async () => ({
          source: "macos-frontmost",
          cwd: root,
          app: "Cursor",
          window: "app.test.ts — 3 tests failed",
          context: `active app: Cursor\nactive window: app.test.ts — 3 tests failed\nrepo: ${root}`,
        }),
      })).toBe(0);
      expect(logs.join("\n")).toContain("ambient look: Cursor · app.test.ts");
      expect(logs.join("\n")).toContain("next: Fix failing tests");
    } finally {
      spy.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("tick captures the active app/window when --context is omitted", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-ambient-cli-"));
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((line = "") => { logs.push(String(line)); });
    try {
      expect(await runAmbientScreenCommand(root, ["enable", "--interval-sec", "1"])).toBe(0);
      expect(await runAmbientScreenCommand(root, ["tick"], {
        collectActiveContext: async () => ({
          source: "macos-frontmost",
          cwd: root,
          app: "Terminal",
          window: "build failed",
          context: `active app: Terminal\nactive window: build failed\nrepo: ${root}`,
        }),
      })).toBe(0);
      expect(logs.join("\n")).toContain("ambient proposal: Fix failing tests");
    } finally {
      spy.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });
});
