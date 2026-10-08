import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { installMicrophonePermissions, microphonePermissionCheck, microphonePermissionRequest } from "./microphone-permissions.mjs";

function fixture() {
  let origin = "http://127.0.0.1:7790";
  let url = `${origin}/`;
  const webContents = { getURL: () => url, isDestroyed: () => false };
  const window = { webContents, isDestroyed: () => false };
  const options = { getWindow: () => window, getOrigin: () => origin };
  const details = { isMainFrame: true, requestingUrl: url, securityOrigin: origin, mediaType: "audio", mediaTypes: ["audio"] };
  return { options, details, window, webContents, setOrigin: (value) => { origin = value; }, setUrl: (value) => { url = value; } };
}

test("allows only audio in the live main window's exact origin", () => {
  const f = fixture();
  assert.equal(microphonePermissionCheck(f.webContents, "media", f.options.getOrigin(), f), true);
  assert.equal(microphonePermissionRequest(f.webContents, "media", f), true);
  for (const mediaTypes of [[], ["video"], ["audio", "video"], ["unknown"], undefined]) {
    assert.equal(microphonePermissionRequest(f.webContents, "media", { ...f, details: { ...f.details, mediaTypes } }), false);
  }
  for (const mediaType of ["video", "unknown", undefined]) {
    assert.equal(microphonePermissionCheck(f.webContents, "media", f.options.getOrigin(), { ...f, details: { ...f.details, mediaType } }), false);
  }
});

test("denies other windows, missing windows, destroyed windows, and subframes", () => {
  const f = fixture();
  assert.equal(microphonePermissionRequest({ ...f.webContents }, "media", f), false);
  assert.equal(microphonePermissionRequest(null, "media", f), false);
  assert.equal(microphonePermissionRequest(f.webContents, "media", { ...f, details: { ...f.details, isMainFrame: false } }), false);
  assert.equal(microphonePermissionRequest(f.webContents, "media", { ...f, options: { ...f.options, getWindow: () => undefined } }), false);
  f.window.isDestroyed = () => true;
  assert.equal(microphonePermissionRequest(f.webContents, "media", f), false);
});

test("denies foreign URLs, alternate loopback spellings, stale ports, and credentials", () => {
  const f = fixture();
  for (const requestingUrl of ["https://example.com", "http://localhost:7790", "http://127.0.0.1:7791", "http://user@127.0.0.1:7790", "data:text/html,test", undefined]) {
    assert.equal(microphonePermissionRequest(f.webContents, "media", { ...f, details: { ...f.details, requestingUrl } }), false);
  }
  assert.equal(microphonePermissionCheck(f.webContents, "media", "http://127.0.0.1:9999", f), false);
  assert.equal(microphonePermissionRequest(f.webContents, "media", { ...f, details: { ...f.details, securityOrigin: "https://example.com" } }), false);
  f.setUrl("https://example.com");
  assert.equal(microphonePermissionRequest(f.webContents, "media", f), false);
});

test("reads the current port after registration, not the initial default", () => {
  const f = fixture();
  const handlers = {};
  installMicrophonePermissions({ setPermissionCheckHandler: (fn) => { handlers.check = fn; }, setPermissionRequestHandler: (fn) => { handlers.request = fn; } }, f.options);
  f.setOrigin("http://127.0.0.1:8844");
  f.setUrl("http://127.0.0.1:8844/");
  assert.equal(handlers.check(f.webContents, "media", "http://127.0.0.1:7790", f.details), false);
  const details = { ...f.details, requestingUrl: "http://127.0.0.1:8844/", securityOrigin: "http://127.0.0.1:8844" };
  assert.equal(handlers.check(f.webContents, "media", "http://127.0.0.1:8844", details), true);
  let granted;
  handlers.request(f.webContents, "media", (value) => { granted = value; }, details);
  assert.equal(granted, true);
});

test("preserves trusted Copy without granting clipboard reads or browser screen capture", () => {
  const f = fixture();
  assert.equal(microphonePermissionCheck(f.webContents, "clipboard-sanitized-write", f.options.getOrigin(), f), true);
  assert.equal(microphonePermissionRequest(f.webContents, "clipboard-sanitized-write", f), true);
  for (const permission of ["clipboard-read", "display-capture", "geolocation", "notifications", "unknown"]) {
    assert.equal(microphonePermissionRequest(f.webContents, permission, f), false);
  }
});

test("packaging configuration declares microphone purpose and hardened audio input", () => {
  const config = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  const mac = config.build.mac;
  assert.equal(mac.hardenedRuntime, true);
  assert.match(mac.extendInfo.NSMicrophoneUsageDescription, /only when you start dictation/);
  for (const path of [mac.entitlements, mac.entitlementsInherit]) {
    const plist = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
    assert.match(plist, /<key>com\.apple\.security\.device\.audio-input<\/key>\s*<true\/>/);
    assert.doesNotMatch(plist, /com\.apple\.security\.device\.camera/);
  }
});
