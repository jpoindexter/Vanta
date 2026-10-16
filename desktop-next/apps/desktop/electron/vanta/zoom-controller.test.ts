import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createJsonZoomStore, createZoomController } from "./zoom-controller";

const dirs: string[] = [];

afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { force: true, recursive: true })));

const tmp = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vanta-zoom-"));
  dirs.push(dir);

  return dir;
};

function fakeWindow(level = 0) {
  const state = { destroyed: false, level };
  const send = vi.fn();

  return {
    send,
    state,
    window: {
      isDestroyed: () => state.destroyed,
      webContents: {
        getZoomLevel: () => state.level,
        send,
        setZoomLevel: (next: number) => {
          state.level = next;
        }
      }
    }
  };
}

describe("json zoom store", () => {
  it("round-trips a level and survives a missing, corrupt or out-of-shape file", () => {
    const file = path.join(tmp(), "nested", "zoom.json");
    const store = createJsonZoomStore(file);

    expect(store.read()).toBeNull();
    store.write(1.5);
    expect(store.read()).toBe(1.5);

    writeFileSync(file, "{not json");
    expect(store.read()).toBeNull();
    writeFileSync(file, JSON.stringify({ level: "big" }));
    expect(store.read()).toBeNull();
  });

  it("clamps a saved level that is out of range", () => {
    const file = path.join(tmp(), "zoom.json");
    writeFileSync(file, JSON.stringify({ level: 99 }));

    expect(createJsonZoomStore(file).read()).toBe(9);
  });

  it("does not throw when the folder cannot be written", () => {
    const dir = tmp();
    writeFileSync(path.join(dir, "blocked"), "a file, not a folder");

    expect(() => createJsonZoomStore(path.join(dir, "blocked", "zoom.json")).write(1)).not.toThrow();
  });
});

describe("zoom controller", () => {
  it("steps in and out, resets, saves each level and tells the renderer", () => {
    const { send, state, window } = fakeWindow(0);
    const written: number[] = [];
    const zoom = createZoomController({ read: () => null, write: level => written.push(level) }, () => window);

    zoom.in();
    zoom.in();
    zoom.out();

    expect(state.level).toBeCloseTo(0.1, 9);
    expect(written).toHaveLength(3);
    expect(send).toHaveBeenLastCalledWith("desktop:zoom:changed", { level: expect.closeTo(0.1, 9), percent: 102 });

    zoom.reset();
    expect(state.level).toBe(0);
    expect(written.at(-1)).toBe(0);
  });

  it("applies a percent from the renderer and ignores one that is not a sane number", () => {
    const { state, window } = fakeWindow(0);
    const zoom = createZoomController({ read: () => null, write: () => undefined }, () => window);

    zoom.persistPercent(150);
    expect(Math.round(1.2 ** state.level * 100)).toBe(150);

    for (const bad of ["abc", NaN, Infinity, -5, 0, 1_000_000, null, undefined, {}]) {
      const before = state.level;
      zoom.persistPercent(bad);
      expect(state.level).toBe(before);
    }
  });

  it("restores the saved level, and does nothing when the window already shows it", () => {
    const { send, state, window } = fakeWindow(0);
    const zoom = createZoomController({ read: () => 2, write: () => undefined }, () => window);

    zoom.restore();
    expect(state.level).toBe(2);
    expect(send).toHaveBeenCalledTimes(1);

    zoom.restore();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does nothing without a window, with a destroyed window, or with nothing saved", () => {
    const store = { read: () => null as null | number, write: vi.fn() };
    const none = createZoomController(store, () => null);
    none.in();
    none.restore();

    const { state, window } = fakeWindow(0);
    state.destroyed = true;
    createZoomController({ read: () => 3, write: store.write }, () => window).restore();
    createZoomController(store, () => window).reset();

    expect(store.write).not.toHaveBeenCalled();
    expect(state.level).toBe(0);
  });

  it("writes through to a real file", () => {
    const file = path.join(tmp(), "zoom.json");
    const { window } = fakeWindow(0);

    createZoomController(createJsonZoomStore(file), () => window).persistPercent(120);

    expect(existsSync(file)).toBe(true);
    expect(JSON.parse(readFileSync(file, "utf8")).level).toBeCloseTo(1, 5);
  });
});
