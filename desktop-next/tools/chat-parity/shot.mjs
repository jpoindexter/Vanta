// node tools/chat-parity/shot.mjs <state> <theme> <width> <out.png> [flags]
import { chromium, openBuilt } from "./measure.mjs";
const [state = "waiting", theme = "light", w = "1440", out = "shot.png", flags = ""] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome" });
const { page, errors } = await openBuilt(browser, { state, theme, w, flags, base: process.env.CHAT_BASE ?? "http://127.0.0.1:5199" });
await page.screenshot({ path: out, clip: await page.evaluate(() => { const r = document.querySelector("[data-fixture-main]").getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }) });
if (errors.length) console.log("pageerrors:", errors.join(" | "));
await browser.close();
