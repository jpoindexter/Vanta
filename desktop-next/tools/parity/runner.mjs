// Drive a page into a state by running a selector map's drivers, in facet order.
import { orderFacets } from "./states.mjs";
import { locatorFor } from "./locate.mjs";

const DEFAULT_STEP_TIMEOUT_MS = 4000;

const expand = (text, vars) => text.replace(/\$\{(\w+)\}/g, (_, k) => vars[k] ?? "");

async function runStep(ctx, step) {
  const { page, map, vars, timeout } = ctx;
  const loc = (spec) => locatorFor(page, map, spec).first();
  if (step.click) return loc(step.click).click({ timeout });
  if (step.fill) return loc(step.fill).fill(step.value, { timeout });
  if (step.hover) return loc(step.hover).hover({ timeout });
  if (step.press) return step.on ? loc(step.on).press(step.press, { timeout }) : page.keyboard.press(step.press);
  if (step.goto) return page.goto(expand(step.goto, vars), { waitUntil: "load" });
  if (step.reload) return page.reload({ waitUntil: "load" });
  if (step.storage) return page.evaluate(([k, v]) => localStorage.setItem(k, v), [step.storage.key, step.storage.value]);
  if (step.waitFor) return loc(step.waitFor).waitFor({ timeout: step.timeout ?? timeout });
  if (step.eval) return page.evaluate(step.eval);
  if (step.wait !== undefined) return page.waitForTimeout(step.wait);
  throw new Error(`unknown step ${JSON.stringify(step)}`);
}

/** Facets that a map cannot drive (missing or UNMAPPED). */
export function undrivableFacets(map, state) {
  const sizeByViewport = map.viewport.mode === "frame";
  return state.facets.filter((f) => {
    if (f.startsWith("w:") && sizeByViewport) return false;
    const d = map.drivers[f];
    return d === undefined || d === "UNMAPPED";
  });
}

/**
 * Put the page into `state`. Resolves { ok: true } or { ok: false, reason }.
 * `target.setSize` is used when the map sizes by viewport.
 */
export async function enterState({ target, map, state, options }) {
  const missing = undrivableFacets(map, state);
  if (missing.length) return { ok: false, reason: `no driver for ${missing.join(", ")}` };
  const ctx = { page: target.page, map, vars: options.vars, timeout: options.stepTimeout ?? DEFAULT_STEP_TIMEOUT_MS };
  try {
    if (map.viewport.mode === "frame") await target.setSize(state.frame.w, state.frame.h);
    for (const step of map.drivers.base ?? []) await runStep(ctx, step);
    for (const facet of orderFacets(state.facets)) {
      const steps = map.drivers[facet];
      if (facet.startsWith("w:") && map.viewport.mode === "frame" && steps === undefined) continue;
      for (const step of steps) await runStep(ctx, step);
    }
    await target.page.waitForTimeout(options.settleMs ?? 0);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `driver failed: ${String(err.message).split("\n")[0]}` };
  }
}
