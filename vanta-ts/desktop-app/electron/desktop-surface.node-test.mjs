import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createDesktopSurface, fitBounds } from "./desktop-surface.mjs";

class FakeWindow extends EventEmitter {
  bounds = { x: 50, y: 40, width: 1200, height: 900 };
  minimum = [760, 620];
  always = false;
  maximized = false;
  fullscreen = false;
  destroyed = false;
  calls = [];
  isDestroyed() { return this.destroyed; }
  isMinimized() { return false; }
  isMaximized() { return this.maximized; }
  isFullScreen() { return this.fullscreen; }
  isAlwaysOnTop() { return this.always; }
  getNormalBounds() { return { ...this.bounds }; }
  getBounds() { return { ...this.bounds }; }
  getMinimumSize() { return [...this.minimum]; }
  setMinimumSize(...value) { this.minimum = value; }
  setBounds(value) { this.bounds = value; }
  setAlwaysOnTop(value) { this.always = value; }
  unmaximize() { this.maximized = false; }
  maximize() { this.maximized = true; }
  setFullScreen(value) { this.fullscreen = value; if (!value) queueMicrotask(() => this.emit("leave-full-screen")); }
  show() { this.calls.push("show"); }
  focus() { this.calls.push("focus"); }
}

function fixture() {
  const window = new FakeWindow();
  const modes = [];
  const display = { workArea: { x: 0, y: 0, width: 1440, height: 960 } };
  const surface = createDesktopSurface({ getWindow: () => window, screen: { getDisplayMatching: () => display }, onMode: (mode) => modes.push(mode) });
  return { window, modes, display, surface };
}

test("compact repeated then full preserves the same window and original geometry", async () => {
  const { window, modes, surface } = fixture();
  const initial = window.getBounds();
  await surface.setMode("mini");
  assert.equal(surface.mode(), "mini");
  assert.equal(window.bounds.width, 480);
  assert.deepEqual(window.minimum, [360, 480]);
  assert.equal(window.always, true);
  await surface.setMode("mini");
  await surface.setMode("full");
  assert.deepEqual(window.bounds, initial);
  assert.deepEqual(window.minimum, [760, 620]);
  assert.equal(window.always, false);
  assert.deepEqual(modes, ["mini", "full"]);
  assert.equal(window.calls.filter((call) => call === "focus").length, 3);
});

test("restores fullscreen, maximized and always-on-top state", async () => {
  const { window, surface } = fixture();
  window.fullscreen = true; window.maximized = true; window.always = true;
  await surface.setMode("mini");
  assert.equal(window.fullscreen, false); assert.equal(window.maximized, false);
  await surface.setMode("full");
  assert.equal(window.fullscreen, true); assert.equal(window.maximized, true); assert.equal(window.always, true);
});

test("restored bounds fit a remaining display after monitor removal", async () => {
  const { window, surface, display } = fixture();
  window.bounds = { x: 3000, y: -900, width: 1200, height: 900 };
  await surface.setMode("mini");
  display.workArea = { x: 0, y: 24, width: 1024, height: 744 };
  await surface.setMode("full");
  assert.deepEqual(window.bounds, { x: 0, y: 24, width: 1024, height: 744 });
});

test("invalid renderer values are rejected without changing presentation", async () => {
  const { surface, modes } = fixture();
  await assert.rejects(surface.setMode("../arbitrary"), /Invalid desktop mode/);
  assert.equal(surface.mode(), "full"); assert.deepEqual(modes, []);
});

test("mode changes never invent or reload a renderer and fit narrow displays", async () => {
  const { window, surface } = fixture();
  window.loadURL = () => { throw new Error("must not reload"); };
  await surface.setMode("mini"); await surface.setMode("full");
  assert.deepEqual(fitBounds({ x: -99, y: 99, width: 480, height: 720 }, { x: 10, y: 20, width: 400, height: 600 }), { x: 10, y: 20, width: 400, height: 600 });
});
