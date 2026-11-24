import { chromium, openWireframe, measureAll } from "./measure.mjs";
const [state = "waiting", w = "1440", theme = "light"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome" });
const { page, mainSel } = await openWireframe(browser, { w, theme, state });
console.log(JSON.stringify(await measureAll(page, mainSel, "wf", state), null, 1));
await browser.close();
