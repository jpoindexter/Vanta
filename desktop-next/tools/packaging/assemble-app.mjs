// Turns the stock Electron.app into "Vanta Next.app": renamed executable and helpers, Vanta Info.plist,
// the built renderer + main in app.asar, and the runtime, kernel and licenses as loose Resources.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import * as asar from "@electron/asar";

import { readPlist, removeKey, setKey } from "./plist.mjs";

const HELPER_SUFFIXES = ["", " (GPU)", " (Plugin)", " (Renderer)"];
// The only files from assets/ the shell reads at runtime (tray template, dock icon, window icon fallback).
const RUNTIME_ASSETS = ["icon.png", "icon-mac.png", "trayTemplate.png", "trayTemplate@2x.png"];

const copyFile = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};

function renameHelpers({ frameworks, appName, appId }) {
  for (const suffix of HELPER_SUFFIXES) {
    const oldName = `Electron Helper${suffix}`;
    const newName = `${appName} Helper${suffix}`;
    const oldApp = path.join(frameworks, `${oldName}.app`);
    const newApp = path.join(frameworks, `${newName}.app`);
    fs.renameSync(oldApp, newApp);
    fs.renameSync(path.join(newApp, "Contents", "MacOS", oldName), path.join(newApp, "Contents", "MacOS", newName));
    const plist = path.join(newApp, "Contents", "Info.plist");
    const slug = suffix.replace(/[^A-Za-z]/g, "");
    setKey(plist, "CFBundleExecutable", newName);
    setKey(plist, "CFBundleName", newName);
    setKey(plist, "CFBundleDisplayName", newName);
    setKey(plist, "CFBundleIdentifier", `${appId}.helper${slug ? `.${slug}` : ""}`);
  }
}

function patchInfoPlist({ plist, config, identity, build }) {
  setKey(plist, "CFBundleExecutable", identity.displayName);
  setKey(plist, "CFBundleName", identity.displayName);
  setKey(plist, "CFBundleDisplayName", identity.displayName);
  setKey(plist, "CFBundleIdentifier", identity.appId);
  setKey(plist, "CFBundleIconFile", "icon.icns");
  setKey(plist, "CFBundleShortVersionString", build.version);
  setKey(plist, "CFBundleVersion", build.version);
  setKey(plist, "LSApplicationCategoryType", config.mac.category);
  setKey(plist, "NSHumanReadableCopyright", config.copyright);
  setKey(plist, "VantaBuildCommit", build.commit);
  setKey(plist, "CFBundleURLTypes", config.protocols.map((protocol) => ({
    CFBundleURLName: protocol.name,
    CFBundleURLSchemes: protocol.schemes,
  })));
  for (const [key, value] of Object.entries(config.mac.extendInfo)) setKey(plist, key, value);
  // Electron's stock plist pins the integrity hash of its default_app.asar, which this bundle does not ship.
  removeKey(plist, "ElectronAsarIntegrity");
  removeKey(plist, "NSBluetoothAlwaysUsageDescription");
  removeKey(plist, "NSBluetoothPeripheralUsageDescription");
}

/** package.json inside app.asar: what Electron reads for the app name, userData folder and entry point. */
function asarManifest({ identity, build }) {
  return {
    name: "vanta-next",
    productName: identity.displayName,
    version: build.version,
    description: "Vanta Next: the next-generation Vanta desktop shell.",
    author: "Theft Studio",
    license: "MIT",
    type: "module",
    main: "dist/electron-main.mjs",
    desktopName: identity.appId,
    vantaBuild: { commit: build.commit, builtAt: build.builtAt },
  };
}

async function packAsar({ desktop, work, manifest, destination }) {
  fs.rmSync(work, { recursive: true, force: true });
  fs.cpSync(path.join(desktop, "dist"), path.join(work, "dist"), { recursive: true });
  if (fs.existsSync(path.join(desktop, "public"))) fs.cpSync(path.join(desktop, "public"), path.join(work, "public"), { recursive: true });
  for (const name of RUNTIME_ASSETS) copyFile(path.join(desktop, "assets", name), path.join(work, "assets", name));
  fs.writeFileSync(path.join(work, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await asar.createPackageWithOptions(work, destination, { unpack: "**/*.node" });
  fs.rmSync(work, { recursive: true, force: true });
}

/**
 * Builds the .app. `paths` carries the inputs: desktop (apps/desktop), electronDist (node_modules/electron/dist),
 * runtime (staged vanta-runtime), kernel (binary), notices (files to ship as Resources), work (scratch dir).
 */
export async function assembleApp({ out, paths, config, identity, build }) {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync("ditto", [path.join(paths.electronDist, "Electron.app"), out]);

  const contents = path.join(out, "Contents");
  const resources = path.join(contents, "Resources");
  fs.renameSync(path.join(contents, "MacOS", "Electron"), path.join(contents, "MacOS", identity.displayName));
  renameHelpers({ frameworks: path.join(contents, "Frameworks"), appName: identity.displayName, appId: identity.appId });
  patchInfoPlist({ plist: path.join(contents, "Info.plist"), config, identity, build });

  fs.rmSync(path.join(resources, "default_app.asar"), { force: true });
  fs.rmSync(path.join(resources, "electron.icns"), { force: true });
  copyFile(path.join(paths.desktop, "assets", "icon.icns"), path.join(resources, "icon.icns"));
  await packAsar({ desktop: paths.desktop, work: paths.work, manifest: asarManifest({ identity, build }), destination: path.join(resources, "app.asar") });

  fs.cpSync(paths.runtime, path.join(resources, "vanta-runtime"), { recursive: true });
  copyFile(paths.kernel, path.join(resources, "kernel", "vanta-kernel"));
  fs.chmodSync(path.join(resources, "kernel", "vanta-kernel"), 0o755);
  for (const [from, to] of paths.notices) copyFile(from, path.join(resources, to));
  return { out, plist: readPlist(path.join(contents, "Info.plist")) };
}
