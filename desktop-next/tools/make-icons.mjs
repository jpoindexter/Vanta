// Regenerates every Vanta Next icon from the one brand source (vanta-ts/desktop-app/build/vanta-brand-icon.svg):
// app icons (png/icns/ico), the Icon Composer layers, tray template images, the Windows tile set and the DMG art.
//   node tools/make-icons.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { artLayer, dmgBackground, fullBleed, glyph, plate } from "./icons/marks.mjs";

const here = import.meta.dirname;
const next = path.resolve(here, "..");
const desktop = path.join(next, "apps", "desktop");
const SVG = path.resolve(next, "..", "vanta-ts", "desktop-app", "build", "vanta-brand-icon.svg");
const electron = path.join(desktop, "node_modules", "electron", "dist", "Electron.app", "Contents", "MacOS", "Electron");
const out = (...parts) => path.join(desktop, ...parts);

const work = fs.mkdtempSync(path.join(os.tmpdir(), "vanta-icons-"));
const rasterize = (jobs) => {
  const file = path.join(work, "jobs.json");
  fs.writeFileSync(file, JSON.stringify(jobs.map((job) => ({ ...job, out: path.join(work, job.out) }))));
  execFileSync(electron, [path.join(here, "icons", "render.cjs"), file], { stdio: "inherit", env: { ...process.env, ELECTRON_RUN_AS_NODE: "" } });
};
const magick = (...args) => execFileSync("magick", args.map(String), { stdio: "inherit" });
const resized = (from, size, to) => magick(path.join(work, from), "-filter", "Lanczos", "-resize", `${size}x${size}`, to);

rasterize([
  { html: fullBleed(SVG), width: 1024, height: 1024, out: "square.png" },
  { html: plate(SVG), width: 1024, height: 1024, out: "plate.png" },
  { html: artLayer(SVG), width: 1024, height: 1024, out: "art.png" },
  { html: glyph(SVG, { color: "#FFFFFF", brackets: true, inset: 0.17 }), width: 1024, height: 1024, out: "mono.png" },
  { html: glyph(SVG, { size: 64, color: "#000000", inset: 0.08 }), width: 64, height: 64, out: "tray-big.png" },
  { html: dmgBackground(660, 400), width: 1320, height: 800, out: "dmg.png" },
]);

// App icons. icon.png is the full-bleed brand square (also the tray fallback); the mac/ico/dmg icons use the plate.
fs.copyFileSync(path.join(work, "square.png"), out("assets", "icon.png"));
fs.copyFileSync(path.join(work, "plate.png"), out("assets", "icon-mac.png"));
// The brand is dark-native, so the dark variants carry the same artwork; they exist so no legacy name keeps old art.
fs.copyFileSync(path.join(work, "square.png"), out("assets", "icon-dark.png"));

const iconset = (name) => {
  const dir = path.join(work, `${name}.iconset`);
  fs.mkdirSync(dir, { recursive: true });
  for (const base of [16, 32, 128, 256, 512]) {
    resized("plate.png", base, path.join(dir, `icon_${base}x${base}.png`));
    resized("plate.png", base * 2, path.join(dir, `icon_${base}x${base}@2x.png`));
  }
  return dir;
};
const icns = (name, target) => execFileSync("iconutil", ["-c", "icns", iconset(name), "-o", target]);
icns("app", out("assets", "icon.icns"));
fs.copyFileSync(out("assets", "icon.icns"), out("assets", "icon-dark.icns"));
fs.copyFileSync(out("assets", "icon.icns"), out("packaging", "dmg-volume.icns"));

const ico = (target) => {
  const sizes = [16, 24, 32, 48, 64, 128, 256].map((size) => {
    const file = path.join(work, `ico-${size}.png`);
    resized("plate.png", size, file);
    return file;
  });
  magick(...sizes, target);
};
ico(out("assets", "icon.ico"));
fs.copyFileSync(out("assets", "icon.ico"), out("assets", "icon-dark.ico"));

// Icon Composer package (macOS 26 layered icon): same layers, Vanta artwork.
const layers = out("assets", "icon.icon");
fs.copyFileSync(path.join(work, "art.png"), path.join(layers, "Assets", "art-light.png"));
fs.copyFileSync(path.join(work, "art.png"), path.join(layers, "Assets", "art-dark.png"));
fs.copyFileSync(path.join(work, "mono.png"), path.join(layers, "Assets", "mono.png"));
const composer = JSON.parse(fs.readFileSync(path.join(layers, "icon.json"), "utf8"));
const ink = "srgb:0.01961,0.01961,0.02745,1.00000";
for (const spec of composer["fill-specializations"]) spec.value.solid = ink;
fs.writeFileSync(path.join(layers, "icon.json"), `${JSON.stringify(composer, null, 2)}\n`);

// Menu-bar template images (black on alpha; macOS tints them).
magick(path.join(work, "tray-big.png"), "-resize", "18x18", out("assets", "trayTemplate.png"));
magick(path.join(work, "tray-big.png"), "-resize", "36x36", out("assets", "trayTemplate@2x.png"));

// Windows tile set: every existing tile keeps its name and pixel size, redrawn from the brand mark.
for (const dir of [out("assets", "appx"), out("build", "appx")]) {
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir)) {
    const target = path.join(dir, file);
    const [width, height] = execFileSync("magick", ["identify", "-format", "%w %h", target], { encoding: "utf8" }).split(" ").map(Number);
    const side = Math.min(width, height);
    magick(path.join(work, "plate.png"), "-filter", "Lanczos", "-resize", `${side}x${side}`, "-background", "none", "-gravity", "center", "-extent", `${width}x${height}`, target);
  }
}

// DMG background: a 2x image tagged 144 dpi so it displays at the 660x400 window size.
fs.rmSync(out("packaging", "vanta-dmg-2b.tiff"), { force: true });
magick(path.join(work, "dmg.png"), "-resize", "1320x800!", "-units", "PixelsPerInch", "-density", 144, out("packaging", "vanta-dmg-background.tiff"));

fs.rmSync(work, { recursive: true, force: true });
console.log("icons regenerated from", path.relative(process.cwd(), SVG));
