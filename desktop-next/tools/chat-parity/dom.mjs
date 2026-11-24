// node tools/chat-parity/dom.mjs <state> [theme] [width] [maxDepth] [flags]: outline of the fixtures harness DOM with rects.
import { chromium, openBuilt } from "./measure.mjs";
const [state = "waiting", theme = "light", w = "1440", maxDepth = "12", flags = ""] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome" });
const { page } = await openBuilt(browser, { state, theme, w, flags, base: process.env.CHAT_BASE ?? "http://127.0.0.1:5199" });
console.log(await page.evaluate((depth) => {
  const root = document.querySelector("[data-fixture-main]");
  const base = root.getBoundingClientRect();
  const lines = [];
  const walk = (el, d) => {
    if (d > depth) return;
    const r = el.getBoundingClientRect();
    const slot = el.getAttribute("data-slot") || el.getAttribute("data-vp") || "";
    const cls = typeof el.className === "string" ? el.className.split(/\s+/).slice(0, 5).join(" ") : "";
    const txt = el.children.length === 0 ? (el.textContent || "").trim().slice(0, 40) : "";
    lines.push(`${"  ".repeat(d)}${el.tagName.toLowerCase()}${slot ? `[${slot}]` : ""} ${Math.round(r.left - base.left)},${Math.round(r.top - base.top)} ${Math.round(r.width)}x${Math.round(r.height)} .${cls} ${txt ? `"${txt}"` : ""}`);
    for (const c of el.children) walk(c, d + 1);
  };
  walk(root, 0);
  return lines.join("\n");
}, Number(maxDepth)));
await browser.close();
