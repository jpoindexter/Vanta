import assert from "node:assert/strict";
import { test } from "node:test";
import { compareElement, resolveTol, stripGlyphs, DEFAULT_TOL } from "./compare.mjs";

const ctx = (deviations = []) => ({ key: "nav.home.label", state: "w1440.chat-waiting", deviations });
const el = (o = {}) => ({ visible: true, display: "block", x: 8, y: 126, w: 258, h: 36, ...o });

test("identical elements pass", () => {
  const r = compareElement({ expected: el(), actual: el(), tol: DEFAULT_TOL, ctx: ctx() });
  assert.equal(r.status, "PASS");
});

test("a 3px width error beyond the 1px tolerance fails only w", () => {
  const r = compareElement({ expected: el(), actual: el({ w: 261 }), tol: DEFAULT_TOL, ctx: ctx() });
  assert.equal(r.status, "FAIL");
  assert.deepEqual(r.props.map((p) => p.prop), ["w"]);
});

test("a 2px position drift is within tolerance, 3px is not", () => {
  assert.equal(compareElement({ expected: el(), actual: el({ x: 10 }), tol: DEFAULT_TOL, ctx: ctx() }).status, "PASS");
  assert.equal(compareElement({ expected: el(), actual: el({ x: 11 }), tol: DEFAULT_TOL, ctx: ctx() }).status, "FAIL");
});

test("missing and hidden app elements fail visibility", () => {
  assert.equal(compareElement({ expected: el(), actual: null, tol: DEFAULT_TOL, ctx: ctx() }).props[0].actual, "absent");
  assert.equal(compareElement({ expected: el(), actual: { visible: false, display: "none" }, tol: DEFAULT_TOL, ctx: ctx() }).props[0].actual, "hidden");
});

test("an element the wireframe hides passes when the app hides or omits it", () => {
  const expected = { visible: false, display: "none" };
  assert.equal(compareElement({ expected, actual: null, tol: DEFAULT_TOL, ctx: ctx() }).status, "PASS");
  assert.equal(compareElement({ expected, actual: el(), tol: DEFAULT_TOL, ctx: ctx() }).status, "FAIL");
});

test("glyph-only text difference is ALLOWED only with a declared deviation", () => {
  const expected = el({ text: "▲ Run a command" });
  const actual = el({ text: "Run a command" });
  assert.equal(compareElement({ expected, actual, tol: DEFAULT_TOL, ctx: ctx() }).status, "FAIL");
  const dev = [{ id: "icon-glyphs", reason: "x", props: ["text"], transform: "stripGlyphs" }];
  const r = compareElement({ expected, actual, tol: DEFAULT_TOL, ctx: ctx(dev) });
  assert.equal(r.status, "ALLOWED");
  assert.equal(r.props[0].deviation, "icon-glyphs");
});

test("a real wording change is a FAIL even with the glyph deviation", () => {
  const dev = [{ id: "icon-glyphs", reason: "x", props: ["text"], transform: "stripGlyphs" }];
  const r = compareElement({ expected: el({ text: "▲ Run a command" }), actual: el({ text: "Run command" }), tol: DEFAULT_TOL, ctx: ctx(dev) });
  assert.equal(r.status, "FAIL");
});

test("hug widens width tolerance, per-key tol overrides it", () => {
  const expected = el({ w: 100 });
  assert.equal(resolveTol({ specOpts: { hug: true }, expected }).w, 12);
  assert.equal(resolveTol({ specOpts: { hug: true }, appTol: { w: 3 }, expected }).w, 3);
  assert.equal(resolveTol({ specOpts: { tol: { w: "10%" } }, expected }).w, 10);
});

test("stripGlyphs removes icon placeholders and collapses space", () => {
  assert.equal(stripGlyphs("▸ Read 3 files"), "Read 3 files");
  assert.equal(stripGlyphs("Sonnet 5.5 ▾"), "Sonnet 5.5");
});

import { buildRows } from "./rows.mjs";
import { copyRow } from "./copy-check.mjs";

const naState = (deviations, keys = {}) => ({
  stateId: "w1440.chat-waiting",
  specState: { elements: { "titlebar.dots": { visible: true, display: "block", x: 12, y: 16, w: 45, h: 11 } }, absent: ["banner.offline"], lists: {} },
  appMap: { keys },
  keyOptions: {},
  deviations,
  measured: { found: {}, counts: {} },
  blocked: null,
});

test("an unmapped key is UNMAPPED unless a not-applicable deviation names it", () => {
  const na = [{ id: "native-controls", reason: "x", props: ["*"], transform: "ignore", na: true, keys: ["titlebar.dots"] }];
  assert.equal(buildRows(naState([])).find((r) => r.key === "titlebar.dots").status, "UNMAPPED");
  const row = buildRows(naState(na)).find((r) => r.key === "titlebar.dots");
  assert.equal(row.status, "ALLOWED");
  assert.equal(row.props[0].deviation, "native-controls");
  assert.equal(buildRows(naState(na)).find((r) => r.key === "banner.offline").status, "UNMAPPED");
});

test("a not-applicable deviation is not a blanket pass for other keys", () => {
  const na = [{ id: "native-controls", reason: "x", props: ["*"], transform: "ignore", na: true, keys: ["titlebar.dots"] }];
  const rows = buildRows(naState(na, { "titlebar.dots": "UNMAPPED" }));
  assert.equal(rows.filter((r) => r.status === "ALLOWED").length, 1);
});

test("copy declared absent is not counted as missing and makes the row ALLOWED", () => {
  const expected = { strings: ["Jason", "Home"], hoverOnly: [] };
  assert.equal(copyRow({ stateId: "s", expected, appStrings: ["Home"] }).status, "FAIL");
  const r = copyRow({ stateId: "s", expected, appStrings: ["Home"], declared: ["Jason"] });
  assert.equal(r.status, "ALLOWED");
  assert.equal(r.declared, 1);
  assert.equal(r.found, 1);
});
