import { readFile } from "node:fs/promises";
import vm from "node:vm";

const htmlPath = new URL("../../../vanta-desktop-demo.html", import.meta.url);
const html = await readFile(htmlPath, "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);

if (!scripts.length) throw new Error("No inline demo script found.");
for (const source of scripts) new vm.Script(source);

for (const required of [
  "vanta.desktop-demo.queue.v1",
  "function loadQueueState()",
  "function persistQueueState()",
  "Queue paused. Your messages are safe.",
  "Retry message",
  "Move earlier",
  "Move later",
]) {
  if (!html.includes(required)) throw new Error(`Missing flow contract: ${required}`);
}

console.log(`FLOW_REPORT_HTML_SYNTAX_OK scripts=${scripts.length}`);
