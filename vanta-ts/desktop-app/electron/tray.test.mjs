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
    const fetchImpl = vi.fn(async (url) => ({ ok: true, json: async () => url.endsWith("/status") ? { kernel: "online" } : url.endsWith("/approval") ? { id: "7" } : url.endsWith("/info") ? { devices: [{ id: "phone" }] } : { code: "BCDFGH", urls: ["http://192.168.1.4:7790/companion"] } }));
    const controller = createTrayController({
      Tray: FakeTray, Menu: { buildFromTemplate: (items) => items },
      nativeImage: { createFromNamedImage: () => ({ setTemplateImage() {} }), createEmpty: () => ({}) },
      dialog, clipboard, BrowserWindow: FakeWindow, app: { quit() {} }, baseUrl: "http://127.0.0.1:7790", fetchImpl,
    });
    await controller.refresh();
    const latest = menus.at(-1);
    expect(latest.map((item) => item.label).filter(Boolean)).toEqual(expect.arrayContaining(["Vanta · online", "Quick Ask", "Approval waiting", "Pair mobile…", "1 paired device"]));
    await controller.pairMobile();
    expect(dialog.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ message: "BCDFGH" }));
    expect(clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("192.168.1.4"));
    controller.dispose();
  });
});
