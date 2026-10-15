import { listPackage } from "@electron/asar";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

const resources = resolve(process.env.VANTA_DESKTOP_RESOURCES ?? "release/mac-arm64/Vanta.app/Contents/Resources");
const forbidden = [
  /^\/node_modules\/@huggingface(?:\/|$)/,
  /^\/node_modules\/@img(?:\/|$)/,
  /^\/node_modules\/adm-zip(?:\/|$)/,
  /^\/node_modules\/global-agent(?:\/|$)/,
  /^\/node_modules\/onnxruntime-(?:common|node|web)(?:\/|$)/,
  /^\/node_modules\/sharp(?:\/|$)/,
];
const archiveMatches = listPackage(resolve(resources, "app.asar"))
  .filter((entry) => forbidden.some((pattern) => pattern.test(entry)));
const unpackedRoot = resolve(resources, "app.asar.unpacked");
const unpackedEntries = await readdir(unpackedRoot, { recursive: true }).catch(() => []);
const unpackedMatches = unpackedEntries
  .map((entry) => `/${entry}`)
  .filter((entry) => forbidden.some((pattern) => pattern.test(entry)));

if (archiveMatches.length || unpackedMatches.length) {
  throw new Error(`desktop dependency boundary failed: ${JSON.stringify({ archiveMatches, unpackedMatches })}`);
}
console.log(JSON.stringify({ ok: true, archiveMatches: 0, unpackedMatches: 0 }));
