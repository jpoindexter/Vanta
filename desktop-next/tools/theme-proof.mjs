// Visual and measured proof for the Vanta theme (DN-01).
//
//   node tools/theme-proof.mjs --out <dir>
//
// Needs the same prerequisites as launch-mock.mjs (built apps/desktop/dist, the
// Electron binary, a read-only Vanta checkout for the mock inference server).
//
// For light/dark x 1440/900 it launches the real renderer in Electron with an
// isolated sandbox, then:
//   - screenshots the chat view (and Settings at 1440)
//   - samples pixels from the screenshot (not from CSS) on named surfaces and
//     compares them with the specified hex and a neutrality bound
//   - scans every visible text node for computed font-size < 12px
//   - reads the colours of a real default-variant Button and the send button
//   - Tabs through the app and reads the keyboard focus ring
// It writes <out>/*.png and <out>/results.json and exits non-zero on any FAIL.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = import.meta.dirname;
const desktopRoot = path.resolve(here, "..", "apps", "desktop");
const vantaRepo = process.env.VANTA_REPO ?? path.join(os.homedir(), ".vanta", "vanta-agent");
const args = process.argv.slice(2);
const outDir = path.resolve(args.includes("--out") ? args[args.indexOf("--out") + 1] : "proofs");
const WIDTHS = [1440, 900];
const HEIGHT = 900;
const FLOOR_PX = 12;
const NEUTRAL_SPREAD = 4; // max(r,g,b) - min(r,g,b): the #202024 text colour itself has 4.
const EXPECTED = {
  light: { main: "#ffffff", sidebar: "#f7f7f8", bubble: "#f0f0f2", primary: "#202024", primaryInk: "#ffffff", ring: "#7c3aed", send: "#7c3aed" },
  dark: { main: "#161616", sidebar: "#101011", bubble: "#262629", primary: "#f4f4f5", primaryInk: "#161616", ring: "#9d6bf5", send: "#9d6bf5" },
};

const require = createRequire(import.meta.url);
const { _electron } = require("playwright-core");
const { PNG } = require("pngjs");
const importVanta = (rel) => import(pathToFileURL(path.join(vantaRepo, "tests-js", "scripts", rel)).href);
const { startMockServer } = await importVanta("mock-server.ts");
const { writeMockProviderConfig, writeEnvFile } = await importVanta("mock-provider-config.ts");

const electronBin = path.join(desktopRoot, "node_modules", "electron", "dist", "Electron.app", "Contents", "MacOS", "Electron");
for (const f of [electronBin, path.join(desktopRoot, "dist", "electron-main.mjs"), path.join(desktopRoot, "dist", "index.html")]) {
  if (!fs.existsSync(f)) throw new Error(`Missing ${f}. Build apps/desktop first.`);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "vanta-theme-proof-"));
const vantaHome = path.join(root, "vanta-home");
const userData = path.join(root, "electron-user-data");
fs.mkdirSync(vantaHome, { recursive: true });
fs.mkdirSync(userData, { recursive: true });
fs.writeFileSync(path.join(userData, "window-state.json"), JSON.stringify({ x: 0, y: 0, width: WIDTHS[0], height: HEIGHT, isMaximized: false }));
fs.writeFileSync(path.join(userData, "zoom-state.json"), JSON.stringify({ zoomLevel: 0 }));
const mock = await startMockServer();
writeMockProviderConfig(vantaHome, mock.url);
writeEnvFile(vantaHome);

const SECRET = /(_API_KEY|_TOKEN|_SECRET|_PASSWORD|_CREDENTIALS|_ACCESS_KEY|_PRIVATE_KEY)$/;
const env = {};
for (const [k, v] of Object.entries(process.env)) {
  if (!v || SECRET.test(k) || (k.startsWith("VANTA_") && !k.startsWith("VANTA_DESKTOP_"))) continue;
  env[k] = v;
}
Object.assign(env, {
  VANTA_HOME: vantaHome, VANTA_DESKTOP_USER_DATA_DIR: userData, VANTA_DESKTOP_IGNORE_EXISTING: "1",
  VANTA_DESKTOP_ISOLATED_BACKEND: "1", HOME: root, VANTA_DESKTOP_VANTA_ROOT: vantaRepo,
  VANTA_DESKTOP_APP_NAME: `VantaThemeProof-${Date.now()}`, VANTA_DESKTOP_SKIP_QUIT_CONFIRM: "1",
});

const app = await _electron.launch({ executablePath: electronBin, args: [desktopRoot, "--disable-gpu", "--no-sandbox", "--force-color-profile=srgb"], env, cwd: desktopRoot });
const page = await app.firstWindow();
const composerSel = '[data-slot="composer-root"] [contenteditable="true"]:visible';
const waitReady = async () => {
  await page.locator(composerSel).first().waitFor({ state: "visible", timeout: 120_000 });
  for (const text of ["Waiting for Vanta backend", "Starting Vanta", "Waiting for Vanta backend", "Starting Vanta"]) {
    await page.getByText(text).first().waitFor({ state: "detached", timeout: 120_000 }).catch(() => {});
  }
  await page.waitForTimeout(500);
};
const resize = (w) => app.evaluate(({ BrowserWindow }, [ww, hh]) => BrowserWindow.getAllWindows()[0].setContentSize(ww, hh), [w, HEIGHT]);
const setMode = async (m) => {
  await page.evaluate((mode) => { localStorage.setItem("vanta-desktop-mode-v1", mode); localStorage.removeItem("vanta-desktop-profile-modes-v1"); }, m);
  await page.reload();
  await waitReady();
};

const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
const spread = (c) => Math.max(...c) - Math.min(...c);
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// getComputedStyle returns rgb(...) or color(srgb r g b / a); composite alpha over `over`.
const parseCss = (css, over = [255, 255, 255]) => {
  const n = css.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
  const srgb = css.startsWith("color(srgb");
  const rgb = srgb ? n.slice(0, 3).map((v) => v * 255) : n.slice(0, 3);
  const a = n.length > 3 ? n[3] : 1;
  return rgb.map((v, i) => Math.round(v * a + over[i] * (1 - a)));
};

const inPage = () => {
  const small = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (!n.nodeValue || !n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest("script,style,noscript")) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const px = parseFloat(cs.fontSize);
    if (px < 12) small.push({ px, text: n.nodeValue.trim().slice(0, 40), cls: String(el.className).slice(0, 80), tag: el.tagName });
  }
  const textColor = (text) => {
    const el = [...document.querySelectorAll("body *")].find((e) => e.children.length === 0 && e.textContent.trim() === text && e.offsetParent);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { color: getComputedStyle(el).color, x: r.x + 2, y: r.y + 2 };
  };
  const root = getComputedStyle(document.documentElement);
  return {
    small,
    theme: document.documentElement.dataset.vantaTheme,
    mode: document.documentElement.dataset.vantaMode,
    bodyFont: getComputedStyle(document.body).fontFamily.slice(0, 80),
    ring: root.getPropertyValue("--dt-ring").trim(),
    primarySolid: [root.getPropertyValue("--dt-primary-solid").trim(), root.getPropertyValue("--dt-primary-solid-foreground").trim()],
    tertiary: textColor("Backend ready") ?? textColor("now"),
  };
};
const rectOf = (loc) => loc.first().evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, vis: !!e.offsetParent }; }).catch(() => null);

const results = [];
const checks = [];
const check = (name, pass, detail) => { checks.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"} ${name} ${detail ?? ""}`); };
fs.mkdirSync(outDir, { recursive: true });
const shot = async (name) => PNG.sync.read(await page.screenshot({ path: path.join(outDir, `${name}.png`), scale: "css" }));
const sample = (png, x, y) => { const i = (png.width * Math.round(y) + Math.round(x)) << 2; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };

// Whole-frame neutrality: every pixel whose channels differ by more than TINT_SPREAD is tinted.
// Returns the count and the busiest 24px cells so a stray hue can be located.
const TINT_SPREAD = 8;
function tintScan(png, ignore = []) {
  const cell = 24;
  const cells = new Map();
  let tinted = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (ignore.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)) continue;
      const i = (png.width * y + x) << 2;
      const sp = Math.max(png.data[i], png.data[i + 1], png.data[i + 2]) - Math.min(png.data[i], png.data[i + 1], png.data[i + 2]);
      if (sp > TINT_SPREAD) {
        tinted++;
        const k = `${Math.floor(x / cell) * cell},${Math.floor(y / cell) * cell}`;
        const e = cells.get(k) ?? { n: 0, rgb: hex([png.data[i], png.data[i + 1], png.data[i + 2]]) };
        e.n++;
        cells.set(k, e);
      }
    }
  }
  const top = [...cells.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6).map(([k, v]) => `${k}:${v.n}px ${v.rgb}`);
  return { tinted, top };
}

let failed = false;
try {
  await waitReady();
  // One real turn so the transcript, user bubble and a session row exist.
  await page.locator(composerSel).first().click();
  await page.locator(composerSel).first().pressSequentially("Say hello");
  await page.keyboard.press("Enter");
  await page.getByText("Hello from the mock inference server", { exact: false }).first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(800);

  for (const mode of ["light", "dark"]) {
    const want = EXPECTED[mode];
    await setMode(mode);
    for (const w of WIDTHS) {
      await resize(w);
      await page.waitForTimeout(700);
      const tag = `${mode}-${w}`;
      await page.mouse.move(w * 0.6, 500);
      await page.waitForTimeout(300);
      const png = await shot(`chat-${tag}`);
      const info = await page.evaluate(inPage);
      const rec = { tag, info, samples: {} };
      check(`${tag} skin is vanta/${mode}`, info.theme === "vanta" && info.mode === mode, `${info.theme}/${info.mode}`);
      check(`${tag} no visible text under ${FLOOR_PX}px`, info.small.length === 0, info.small.slice(0, 5).map((s) => `${s.px}px "${s.text}"`).join("; "));
      const probes = {
        main: { x: w * 0.6, y: 300 },
        bubble: await page.evaluate(() => {
          // The user message in the thread, not the sidebar row or the tab that carry the same title.
          const e = [...document.querySelectorAll("body *")].find((n) => n.children.length === 0 && n.textContent.trim() === "Say hello" && n.getBoundingClientRect().x > 300 && n.getBoundingClientRect().y > 40);
          for (let el = e; el && el !== document.body; el = el.parentElement) {
            const c = getComputedStyle(el).backgroundColor;
            const a = c.includes("/") ? parseFloat(c.split("/")[1]) : c.startsWith("rgba") ? parseFloat(c.split(",")[3]) : 1;
            if (a > 0.9 && el.getBoundingClientRect().width > 150) { const r = el.getBoundingClientRect(); return { x: r.x + r.width - 40, y: r.y + r.height / 2, w: 0 }; }
          }
          return null;
        }),
        sidebar: w >= 1100 ? { x: 130, y: 640 } : null,
      };
      for (const [name, p] of Object.entries(probes)) {
        if (!p) continue;
        const pt = p;
        const c = sample(png, pt.x, pt.y);
        rec.samples[name] = { at: [Math.round(pt.x), Math.round(pt.y)], rgb: hex(c), spread: spread(c) };
        check(`${tag} ${name} grey is neutral`, spread(c) <= NEUTRAL_SPREAD, `${hex(c)} spread ${spread(c)}`);
        if (w === 1440 && want[name]) check(`${tag} ${name} equals ${want[name]}`, hex(c) === want[name], hex(c));
      }
      if (info.tertiary && rec.samples.main) {
        const bg = sample(png, info.tertiary.x, info.tertiary.y);
        const r = ratio(parseCss(info.tertiary.color, bg), bg);
        rec.tertiaryContrast = Number(r.toFixed(2));
        check(`${tag} tertiary text meets 4.5:1`, r >= 4.5, `${r.toFixed(2)}:1 on ${hex(bg)}`);
      }
      const send = await rectOf(page.getByLabel(/Start voice conversation|Send/).first());
      // The composer autofocuses, so its accent border and glow are a focus state, not resting chrome.
      const comp = await rectOf(page.locator('[data-slot="composer-surface"]'));
      const accentZones = [send && { x: send.x - 2, y: send.y - 2, w: send.w + 4, h: send.h + 4 }, comp && { x: comp.x - 12, y: comp.y - 12, w: comp.w + 24, h: comp.h + 24 }].filter(Boolean);
      const scan = tintScan(png, accentZones);
      rec.tintedPixels = scan.tinted;
      check(`${tag} no tinted pixels outside the send button and focused composer`, scan.tinted === 0, `${scan.tinted}px tinted; ${scan.top.join(" | ")}`);
      if (send) {
        const c = sample(png, send.x + send.w / 2, send.y + 3);
        rec.samples.send = { rgb: hex(c) };
        check(`${tag} send button is violet`, hex(c) === want.send, hex(c));
      }
      // Focused composer: the surface border takes the ring colour.
      await page.locator(composerSel).first().focus();
      await page.waitForTimeout(450);
      const fpng = await shot(`composer-focus-${tag}`);
      const surf = await rectOf(page.locator('[data-slot="composer-surface"]'));
      if (surf) {
        // Violet family: blue channel leads, green trails red, clearly saturated.
        let violet = 0;
        for (let y = Math.floor(surf.y) - 2; y < Math.ceil(surf.y + surf.h) + 2; y++) {
          for (let x = Math.floor(surf.x) - 2; x < Math.ceil(surf.x + surf.w) + 2; x++) {
            const [r, g, b] = sample(fpng, x, y);
            if (b > r && r > g + 15 && b - g > 40) violet++;
          }
        }
        rec.composerFocusVioletPixels = violet;
        check(`${tag} focused composer border is violet`, violet >= 100, `${violet}px violet-family pixels on the composer edge`);
      } else check(`${tag} composer surface found`, false, "no [data-slot=composer-surface]");
      results.push(rec);
    }
    // Settings at 1440: a real default-variant Button and a populated screen.
    await resize(1440);
    await page.locator('[aria-label*="ettings"]').first().click();
    await page.waitForTimeout(1200);
    // Measure the resting state: the first field is auto-focused and legitimately shows the accent.
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.mouse.move(700, 600);
    await page.waitForTimeout(400);
    const png = await shot(`settings-${mode}-1440`);
    const settingsScan = tintScan(png);
    check(`${mode}-1440 settings: no tinted pixels`, settingsScan.tinted === 0, `${settingsScan.tinted}px tinted; ${settingsScan.top.join(" | ")}`);
    const info = await page.evaluate(inPage);
    check(`${mode}-1440 settings: no visible text under ${FLOOR_PX}px`, info.small.length === 0, info.small.slice(0, 5).map((s) => `${s.px}px "${s.text}"`).join("; "));
    const apply = await page.getByRole("button", { name: "Apply" }).first().evaluate((b) => { const c = getComputedStyle(b); const r = b.getBoundingClientRect(); return { bg: c.backgroundColor, fg: c.color, x: r.x + 6, y: r.y + r.height / 2 }; }).catch(() => null);
    if (apply) {
      const bg = sample(png, apply.x, apply.y);
      const fg = parseCss(apply.fg, bg);
      check(`${mode} primary button fill is ${want.primary}`, hex(bg) === want.primary, hex(bg));
      check(`${mode} primary button ink is ${want.primaryInk}`, hex(fg) === want.primaryInk, hex(fg));
      results.push({ tag: `primary-${mode}`, fill: hex(bg), ink: hex(fg), contrast: Number(ratio(fg, bg).toFixed(2)) });
    } else check(`${mode} primary button found`, false, "no Apply button on the settings screen");
    check(`${mode} --dt-primary-solid pair`, info.primarySolid[0].toLowerCase() === want.primary && info.primarySolid[1].toLowerCase() === want.primaryInk, info.primarySolid.join(" / "));
    results.push({ tag: `settings-${mode}`, info });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // Keyboard focus ring: Tab until three focus-visible elements that are not first-run tip regions
    // (those pulse their own outline colour).
    await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
    const ring = [];
    for (let i = 0; i < 30 && ring.length < 3; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(400); // outline-color is inside Tailwind's transition-colors; read the settled value
      const r = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body || !e.matches(":focus-visible") || e.closest("[data-tip-target],[data-tip-region]") || getComputedStyle(e).animationName !== "none") return null; const c = getComputedStyle(e); return { el: e.tagName + "." + String(e.className).slice(0, 40), outline: c.outlineStyle === "none" ? null : `${c.outlineWidth} ${c.outlineColor}` }; });
      if (r) ring.push(r);
    }
    const expectedRing = parseCss(want.ring, [0, 0, 0]);
    const okRing = ring.length > 0 && ring.every((r) => r.outline && hex(parseCss(r.outline.replace(/^\S+ /, ""))) === want.ring);
    check(`${mode} keyboard focus ring is ${want.ring}`, okRing, JSON.stringify(ring));
    results.push({ tag: `focus-${mode}`, ring, expectedRing });
  }
  failed = checks.some((c) => !c.pass);
} finally {
  fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify({ checks, results }, null, 2));
  await app.close().catch(() => {});
  await mock.close();
  fs.rmSync(root, { recursive: true, force: true });
}
console.log(`\n${checks.filter((c) => c.pass).length}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
