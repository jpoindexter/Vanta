import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import vm from "node:vm";

const snapshotRoot = resolve(new URL("../../..", import.meta.url).pathname);
const html = await readFile(join(snapshotRoot, "vanta-desktop-demo.html"), "utf8");
const source = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
if (!source) throw new Error("Demo script not found.");

const fullTsRoot = process.env.VANTA_FULL_TS_ROOT
  ?? "/Users/jasonpoindexter/Documents/GitHub/docs/Vanta/vanta-ts";
const require = createRequire(join(fullTsRoot, "package.json"));
const { parseHTML } = require("linkedom");
const values = new Map();
const localStorage = {
  clear: () => values.clear(),
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};

function boot() {
  const { window } = parseHTML(html);
  Object.defineProperty(window, "localStorage", { value: localStorage });
  Object.assign(window, {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: (callback) => callback(),
  });
  window.Element.prototype.scrollTo = () => undefined;
  const context = vm.createContext(window);
  vm.runInContext(source, context);
  return context;
}

localStorage.clear();
const first = boot();
vm.runInContext(`
  startRun("Current task");
  prompt.value = "Persist this queued follow-up";
  queuePrompt();
  stopTask();
`, first);

const second = boot();
const result = vm.runInContext(`({
  count: queuedPrompts.length,
  text: queuedPrompts[0]?.text,
  interrupted: queueInterrupted,
  pausedCopy: document.querySelector("#queuePaused")?.textContent?.trim()
})`, second);

if (result.count !== 1 || result.text !== "Persist this queued follow-up" || !result.interrupted) {
  throw new Error(`Queue state did not survive reload: ${JSON.stringify(result)}`);
}
if (!result.pausedCopy?.includes("Your messages are safe")) {
  throw new Error(`Paused recovery copy is missing: ${JSON.stringify(result)}`);
}

console.log("FLOW_REPORT_QUEUE_DOM_PROOF_OK", JSON.stringify(result));
