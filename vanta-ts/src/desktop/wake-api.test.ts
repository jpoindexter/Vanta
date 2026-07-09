import { describe, expect, it, vi } from "vitest";
import { getWakeApi, setWakeApi } from "./wake-api.js";
import type { WakeServiceStatus } from "../voice/wake-service.js";

const base = (enabled: boolean, running: boolean): WakeServiceStatus => ({
  enabled,
  running,
  statePath: "/home/wake-word.json",
  logPath: "/home/wake-word.log",
});

describe("desktop wake API", () => {
  it("reports a local, visible wake state", async () => {
    await expect(getWakeApi({ status: async () => base(true, true), phrase: "Computer" })).resolves.toEqual({
      enabled: true,
      running: true,
      phrase: "Computer",
      detection: "local Whisper",
    });
  });

  it("routes explicit enable and disable actions", async () => {
    const enable = vi.fn(async () => base(true, true));
    const disable = vi.fn(async () => base(false, false));
    const ready = vi.fn(async () => {});
    expect((await setWakeApi("/repo", true, { enable, disable, ready })).enabled).toBe(true);
    expect(ready).toHaveBeenCalledOnce();
    expect(enable).toHaveBeenCalledWith("/repo");
    expect((await setWakeApi("/repo", false, { enable, disable, ready })).enabled).toBe(false);
    expect(disable).toHaveBeenCalledOnce();
    expect(ready).toHaveBeenCalledOnce();
  });
});
