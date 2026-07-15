import { describe, expect, it, vi } from "vitest";
import { createTrayController } from "./tray.mjs";

describe("tray controller", () => {
  it("surfaces online status, pending approval, quick ask, and pairing", async () => {
    const menus = [];
    class FakeTray { setToolTip() {} setContextMenu(menu) { menus.push(menu); } on() {} destroy() {} }
    class FakeWindow {
      static getAllWindows() { return []; }
      isDestroyed() { return false; } on() {} async loadURL() {} show() {} focus() {} destroy() {}
    }
    const dialog = { showMessageBox: vi.fn(async () => ({ response: 0 })) };
    const clipboard = { writeText: vi.fn() };
    const createFromNamedImage = vi.fn(() => ({ setTemplateImage() {} }));
    const fetchImpl = vi.fn(async (url, opts) => ({ ok: true, json: async () => url.endsWith("/status") ? { kernel: "online" } : url.endsWith("/approval") ? { id: "7" } : url.endsWith("/info") ? { devices: [{ id: "phone" }] } : url.endsWith("/wake") ? { enabled: opts?.method === "POST", running: opts?.method === "POST" } : { code: "BCDFGH", urls: ["http://192.168.1.4:7790/companion"] } }));
    const controller = createTrayController({
      Tray: FakeTray, Menu: { buildFromTemplate: (items) => items },
      nativeImage: { createFromNamedImage, createEmpty: () => ({}) },
      dialog, clipboard, BrowserWindow: FakeWindow, app: { quit() {} }, baseUrl: "http://127.0.0.1:7790", fetchImpl,
    });
    expect(createFromNamedImage).toHaveBeenCalledWith("ellipsis", { pointSize: 13, weight: "semibold" });
    await controller.refresh();
    const latest = menus.at(-1);
    expect(latest.map((item) => item.label).filter(Boolean)).toEqual(expect.arrayContaining(["Vanta · online", "Quick Ask", "Approval waiting", "Wake word · Hey Vanta", "Pair mobile…", "1 paired device"]));
    await controller.toggleWake();
    expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:7790/api/wake", expect.objectContaining({ method: "POST" }));
    await controller.pairMobile();
    expect(dialog.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ message: "BCDFGH" }));
    expect(clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("192.168.1.4"));
    controller.dispose();
  });
});
