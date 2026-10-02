import assert from "node:assert/strict";
import test from "node:test";
import { registerPresenceBridge } from "./desktop-presence.mjs";

function fixture() {
  const handlers = new Map();
  const main = { webContents: { id: 1 } };
  const avatarContents = { id: 2 };
  const calls = [];
  const surface = { mode: () => "full", setMode: async (mode) => { calls.push(mode); return mode; } };
  const avatar = { owns: (sender) => sender === avatarContents, phase: () => "ready", setPhase: (phase) => calls.push(phase), hide: () => calls.push("hide") };
  registerPresenceBridge({ ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, getWindow: () => main, surface, avatar });
  const invoke = (name, sender, value) => handlers.get(name)({ sender }, value);
  return { handlers, invoke, main, avatarContents, calls };
}

test("only the main renderer can change surface mode or report bounded status", async () => {
  const f = fixture();
  assert.equal(await f.invoke("vanta:surface-mode", f.main.webContents), "full");
  assert.equal(await f.invoke("vanta:set-surface-mode", f.main.webContents, "mini"), "mini");
  assert.throws(() => f.invoke("vanta:set-surface-mode", { id: 99 }, "mini"), /Untrusted/);
  assert.throws(() => f.invoke("vanta:set-surface-mode", f.main.webContents, "shell"), /Invalid/);
  f.invoke("vanta:surface-phase", f.main.webContents, "working");
  assert.throws(() => f.invoke("vanta:surface-phase", f.main.webContents, "private user message"), /Invalid/);
  assert.deepEqual(f.calls, ["mini", "working"]);
});

test("avatar can only open existing workspace, read bounded status, or hide itself", async () => {
  const f = fixture();
  assert.equal(await f.invoke("vanta:avatar-open", f.avatarContents), "mini");
  assert.equal(f.invoke("vanta:avatar-phase", f.avatarContents), "ready");
  f.invoke("vanta:avatar-hide", f.avatarContents);
  assert.throws(() => f.invoke("vanta:surface-mode", f.avatarContents), /Untrusted/);
  assert.throws(() => f.invoke("vanta:avatar-open", f.main.webContents), /Untrusted/);
  assert.deepEqual(f.calls, ["mini", "hide"]);
});
