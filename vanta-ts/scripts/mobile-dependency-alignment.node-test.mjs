import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const json = path => JSON.parse(fs.readFileSync(new URL(path, root), "utf8"));
const manifest = json("package.json");
const lock = json("package-lock.json");
const version = lock.packages["node_modules/@capacitor/core"].version;

test("Capacitor core, iOS and CLI declarations and installed packages use one exact version", () => {
  for (const name of ["@capacitor/core", "@capacitor/ios", "@capacitor/cli"]) {
    const declared = manifest.dependencies?.[name] ?? manifest.devDependencies[name];
    assert.equal(declared, version, `${name}: pin the same exact version before native sync`);
    assert.equal(lock.packages[`node_modules/${name}`].version, version, `${name}: refresh the lockfile`);
    assert.equal(json(`node_modules/${name}/package.json`).version, version, `${name}: run npm ci`);
  }
});

test("checked-in Swift manifest and Xcode resolution match the JavaScript Capacitor runtime", () => {
  const swift = fs.readFileSync(new URL("ios/App/CapApp-SPM/Package.swift", root), "utf8");
  const nativeVersion = swift.match(/capacitor-swift-pm\.git",\s*exact:\s*"([^"]+)"/)?.[1];
  assert.equal(nativeVersion, version, "Run cap update ios to regenerate the native manifest");
  const resolved = json("ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved");
  const pin = resolved.pins.find(item => item.identity === "capacitor-swift-pm");
  assert.equal(pin?.location, "https://github.com/ionic-team/capacitor-swift-pm.git");
  assert.equal(pin?.state.version, version, "Resolve Swift packages and refresh the Xcode lockfile");
  assert.match(pin.state.revision, /^[a-f0-9]{40}$/);
});
