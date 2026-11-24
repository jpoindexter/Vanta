import { describe, expect, it, vi } from "vitest";

import { CH } from "./channels";
import { createMiniWindowController, type MainWindowLike, type MiniHandle } from "./mini-window-controller";

function fakeMain(visible = true) {
  const main = { destroyed: false, visible };
  const win: MainWindowLike = {
    focus: vi.fn(),
    hide: vi.fn(() => void (main.visible = false)),
    isDestroyed: () => main.destroyed,
    isVisible: () => main.visible,
    restore: vi.fn(),
    show: vi.fn(() => void (main.visible = true))
  };

  return { main, win };
}

function setup(mainVisible = true) {
  const { main, win } = fakeMain(mainVisible);
  const handles: Array<MiniHandle & { fireClosed: () => void; destroyed: boolean }> = [];
  const broadcast = vi.fn();

  const controller = createMiniWindowController({
    broadcast,
    mainWindow: () => win,
    recenter: vi.fn(),
    spawn: () => {
      let closed: () => void = () => undefined;

      const handle = {
        close: vi.fn(() => {
          handle.destroyed = true;
          closed();
        }),
        destroyed: false,
        fireClosed: () => {
          handle.destroyed = true;
          closed();
        },
        focus: vi.fn(),
        isDestroyed: () => handle.destroyed,
        once: (_event: "closed", listener: () => void) => void (closed = listener),
        send: vi.fn()
      };
      handles.push(handle);

      return handle;
    }
  });

  return { broadcast, controller, handles, main, win };
}

describe("mini window controller", () => {
  it("opens, steps the main window aside and tells every window", () => {
    const { broadcast, controller, handles, win } = setup();

    controller.open("s-1");

    expect(handles).toHaveLength(1);
    expect(win.hide).toHaveBeenCalledTimes(1);
    expect(controller.isOpen()).toBe(true);
    expect(broadcast).toHaveBeenCalledWith(CH.hudChanged, { open: true, sessionId: "s-1" });
  });

  it("brings the main window back and announces the close, whichever side closed it", () => {
    const { broadcast, controller, handles, win } = setup();

    controller.open(null);
    handles[0]?.fireClosed();

    expect(win.show).toHaveBeenCalledTimes(1);
    expect(win.focus).toHaveBeenCalledTimes(1);
    expect(controller.isOpen()).toBe(false);
    expect(broadcast).toHaveBeenLastCalledWith(CH.hudChanged, { open: false, sessionId: null });
  });

  it("does not show a main window that was already hidden before the mini window opened", () => {
    const { controller, handles, win } = setup(false);

    controller.open(null);
    handles[0]?.fireClosed();

    expect(win.hide).not.toHaveBeenCalled();
    expect(win.show).not.toHaveBeenCalled();
  });

  it("points an open mini window at another conversation instead of opening a second one", () => {
    const { broadcast, controller, handles } = setup();

    controller.open("a");
    controller.open("b");
    controller.open("b");

    expect(handles).toHaveLength(1);
    expect(handles[0]?.send).toHaveBeenCalledTimes(1);
    expect(handles[0]?.send).toHaveBeenCalledWith(CH.hudGoto, "b");
    expect(handles[0]?.focus).toHaveBeenCalledTimes(2);
    expect(broadcast).toHaveBeenLastCalledWith(CH.hudChanged, { open: true, sessionId: "b" });
  });

  it("toggles", () => {
    const { controller, handles } = setup();

    controller.toggle();
    expect(controller.isOpen()).toBe(true);
    controller.toggle();
    expect(controller.isOpen()).toBe(false);
    expect(handles).toHaveLength(1);
  });

  it("closing with no live window still corrects the toggles and restores the main window", () => {
    const { broadcast, controller, handles, win } = setup();

    controller.open(null);
    handles[0]!.destroyed = true;
    controller.close();

    expect(win.show).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenLastCalledWith(CH.hudChanged, { open: false, sessionId: null });
  });

  it("records the session the renderer reports and re-centres only a live window", () => {
    const { controller, handles } = setup();

    expect(controller.recenter()).toBe(false);
    controller.open(null);
    controller.recordSession("s-7");

    expect(controller.sessionId()).toBe("s-7");
    expect(controller.recenter()).toBe(true);
    expect(controller.handle()).toBe(handles[0]);
  });

  it("a window superseded by a respawn does not restore the main window or announce a close", () => {
    const { broadcast, controller, handles, win } = setup();

    controller.open(null);
    handles[0]!.destroyed = true;
    controller.open(null);
    const before = broadcast.mock.calls.length;
    handles[0]?.fireClosed();

    expect(handles).toHaveLength(2);
    expect(win.show).not.toHaveBeenCalled();
    expect(broadcast.mock.calls.length).toBe(before);
  });
});
