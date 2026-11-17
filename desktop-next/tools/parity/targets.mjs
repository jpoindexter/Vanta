// Open the thing being measured: a URL/file in Chrome, or the isolated mock Electron app.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const LAUNCH_TIMEOUT_MS = 120_000;

function buildInitScript(prepare) {
  const parts = [];
  if (prepare.initScript) parts.push(prepare.initScript);
  if (prepare.css) {
    // Init scripts can run before <html> exists, so wait for it.
    parts.push(
      `{const add=()=>{const s=document.createElement("style");s.setAttribute("data-parity","1");s.textContent=${JSON.stringify(prepare.css)};document.documentElement.appendChild(s);};` +
        `if(document.documentElement)add();else new MutationObserver((_,o)=>{if(document.documentElement){o.disconnect();add();}}).observe(document,{childList:true});}`,
    );
  }
  return parts.join("\n");
}

async function openChrome(options) {
  const { chromium } = require("playwright-core");
  const exe = process.env.PARITY_CHROME_PATH;
  const browser = await chromium.launch(exe ? { executablePath: exe } : { channel: "chrome" });
  const context = await browser.newContext({ colorScheme: "light", reducedMotion: "reduce", deviceScaleFactor: 1, viewport: options.viewport });
  const page = await context.newPage();
  return {
    page,
    setSize: (w, h) => page.setViewportSize({ width: w, height: h }),
    close: () => browser.close(),
  };
}

async function openElectron(options) {
  const { launchMockApp } = await import("./launch-app.mjs");
  const app = await launchMockApp({ desktopRoot: options.desktopRoot, width: options.viewport.width, height: options.viewport.height });
  return {
    page: app.page,
    setSize: (w, h) => app.resize(w, h),
    close: () => app.close(),
  };
}

/**
 * kind: "file" | "url" (Chrome) or "electron" (isolated mock launcher).
 * Returns { page, setSize(w,h), close() }.
 */
export async function openTarget({ kind, url, desktopRoot, map, viewport }) {
  const vp = viewport ?? { width: 1600, height: 1200 };
  const handle = kind === "electron" ? await openElectron({ desktopRoot, viewport: vp }) : await openChrome({ viewport: vp });
  const init = buildInitScript(map.prepare);
  if (init) await handle.page.addInitScript(init);
  if (kind !== "electron") {
    const target = kind === "file" ? pathToFileURL(url).href : url;
    await handle.page.goto(target, { waitUntil: "load", timeout: LAUNCH_TIMEOUT_MS });
  }
  return handle;
}

/** Fill the ${frameHeight} placeholder in a map's prepare.css. */
export function prepareMap(map, frameHeight) {
  const css = map.prepare.css?.replaceAll("${frameHeight}", String(frameHeight));
  return { ...map, prepare: { ...map.prepare, ...(css !== undefined && { css }) } };
}
