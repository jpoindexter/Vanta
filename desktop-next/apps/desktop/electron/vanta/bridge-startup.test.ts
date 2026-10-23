import { describe, expect, it, vi } from "vitest";

import { buildDesktopBridge, type BridgeEnv } from "./bridge-surface";

const env = (): BridgeEnv => ({
  customWindowControls: false,
  ipc: {
    invoke: vi.fn(async <T>() => undefined as T),
    on: vi.fn(),
    removeListener: vi.fn(),
    send: vi.fn(),
  },
  pathForFile: () => "",
  zoom: { factor: () => 1, level: () => 0, set: vi.fn() },
});

describe("startup capability boundary", () => {
  it.each(["desktopPluginsRoot", "getRemoteDisplayReason"])(
    "does not advertise unavailable optional %s",
    (member) => {
      expect(buildDesktopBridge(env())).not.toHaveProperty(member);
    },
  );

  it("keeps unsupported explicit operations as failures, not fake success", async () => {
    const bridge = buildDesktopBridge(env());
    const probePluginRepo = bridge.probePluginRepo as () => Promise<unknown>;
    await expect(probePluginRepo()).rejects.toThrow(
      "unsupported: probePluginRepo",
    );
  });
});
