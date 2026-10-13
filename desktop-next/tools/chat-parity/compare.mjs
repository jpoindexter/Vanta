import { chromium, measureAll, openBuilt, openWireframe } from "./measure.mjs";
import { ELEMENTS, GAPS, SCENARIOS } from "./spec.mjs";
import { collectInPage } from "./collect.mjs";

const TOL = 1.5; // px; widths wrap on text so sub-pixel font differences stay inside this

function same(a, b) {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= TOL;
  return a === b;
}

/** Compare wireframe and built for one (state, width, theme) and return parity rows. */
export async function compareState(browser, { state, w, theme, base }) {
  const wf = await openWireframe(browser, { w, theme, state });
  const built = await openBuilt(browser, { w, theme, state, base });
  const wfValues = await measureAll(wf.page, wf.mainSel, "wf", state);
  const builtValues = await measureAll(built.page, built.mainSel, "built", state);
  await wf.ctx.close();
  await built.ctx.close();
  const rows = [];
  for (const spec of ELEMENTS) {
    if (!spec.states.includes(state)) continue;
    const a = wfValues[spec.id] ?? { missing: true };
    const b = builtValues[spec.id] ?? { missing: true };
    for (const prop of spec.props) {
      const wv = a.missing ? "(missing)" : a[prop];
      const bv = b.missing ? "(missing)" : b[prop];
      rows.push({ state, w, theme, id: spec.id, note: spec.note, prop, wireframe: wv, built: bv, pass: !a.missing && !b.missing && same(wv, bv) });
    }
  }
  for (const gap of GAPS) {
    if (!gap.states.includes(state)) continue;
    const gapOf = (values) => {
      const a = values[gap.a];
      const b = values[gap.b];
      return a && b && !a.missing && !b.missing ? Math.round((b._top - a._bottom) * 10) / 10 : "(missing)";
    };
    const wv = gapOf(wfValues);
    const bv = gapOf(builtValues);
    rows.push({ state, w, theme, id: gap.id, note: gap.note, prop: "gapPx", wireframe: wv, built: bv, pass: same(wv, bv) });
  }
  return rows;
}

/** Queue scenario: type while running and press Enter (wireframe) versus the seeded queue (built). */
export async function compareQueue(browser, { w, theme, base }) {
  const wf = await openWireframe(browser, { w, theme, state: "running" });
  await wf.page.fill("#cmp", "Also update the changelog");
  await wf.page.press("#cmp", "Enter");
  const built = await openBuilt(browser, { w, theme, state: "running", flags: "queue", base });
  const rows = [];
  for (const spec of SCENARIOS) {
    if (!spec.id.startsWith("queue.")) continue;
    const a = await wf.page.evaluate(collectInPage, { sel: spec.wf, mainSel: wf.mainSel, props: spec.props });
    const b = await built.page.evaluate(collectInPage, { sel: spec.built, mainSel: built.mainSel, props: spec.props });
    for (const prop of spec.props) {
      const wv = a.missing ? "(missing)" : a[prop];
      const bv = b.missing ? "(missing)" : b[prop];
      rows.push({ state: "running+queue", w, theme, id: spec.id, note: spec.note, prop, wireframe: wv, built: bv, pass: !a.missing && !b.missing && same(wv, bv) });
    }
  }
  await wf.ctx.close();
  await built.ctx.close();
  return rows;
}

if (process.argv[1] === import.meta.filename) {
  const [state = "waiting", w = "1440", theme = "light", base = "http://127.0.0.1:5199"] = process.argv.slice(2);
  const browser = await chromium.launch({ channel: "chrome" });
  const rows = state === "queue" ? await compareQueue(browser, { w, theme, base }) : await compareState(browser, { state, w, theme, base });
  for (const r of rows) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.id}.${r.prop}  wf=${JSON.stringify(r.wireframe)}  built=${JSON.stringify(r.built)}`);
  const failed = rows.filter((r) => !r.pass).length;
  console.log(`\n${rows.length - failed}/${rows.length} pass (${state} ${w} ${theme})`);
  await browser.close();
}
