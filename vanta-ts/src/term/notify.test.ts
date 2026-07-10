import { describe, it, expect, vi } from "vitest";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shouldNotify, notify, notifyAndWait } from "./notify.js";
import { shellHooksPath } from "../hooks/shell-hooks.js";

async function waitFor(path: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if (await access(path).then(() => true).catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  await access(path);
}

describe("notify", () => {
  it("only pings for turns past the threshold", () => {
    expect(shouldNotify(500)).toBe(false);
    expect(shouldNotify(15_000)).toBe(true);
    expect(shouldNotify(500, 100)).toBe(true);
  });

  it("rings the terminal bell via the injected writer", () => {
    const write = vi.fn();
    notify({ title: "Vanta", message: "done", env: {} as NodeJS.ProcessEnv, write });
    expect(write).toHaveBeenCalledWith("\x07");
  });

  it("can suppress the bell", () => {
    const write = vi.fn();
    notify({ title: "Vanta", message: "done", bell: false, env: {} as NodeJS.ProcessEnv, write });
    expect(write).not.toHaveBeenCalled();
  });

  it("fires Notification hooks when hook context is supplied", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-notify-"));
    const marker = join(dir, "notified");
    try {
      await writeFile(shellHooksPath(dir), JSON.stringify({ Notification: [{ matcher: "idle_prompt", command: `touch ${marker}` }] }));
      notify({ title: "Vanta", message: "idle", notificationType: "idle_prompt", dataDir: dir, cwd: dir, env: {} as NodeJS.ProcessEnv, write: () => {} });
      await waitFor(marker);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("can await Notification hook delivery before a one-shot process exits", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-notify-await-"));
    const marker = join(dir, "notified");
    try {
      await writeFile(shellHooksPath(dir), JSON.stringify({ Notification: [{ matcher: "standing_goal_violation", command: `touch ${marker}` }] }));
      await notifyAndWait({ title: "Vanta", message: "goal failed", notificationType: "standing_goal_violation", dataDir: dir, cwd: dir, env: { VANTA_ENABLE_PROJECT_HOOKS: "1" } as NodeJS.ProcessEnv, write: () => {} });
      await access(marker);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
