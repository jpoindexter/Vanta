// Turn one measured state into report rows: one row per wireframe element,
// one per key the wireframe says must be absent, one visible-count row per list.
import { compareElement, resolveTol } from "./compare.mjs";
import { baseKey, isListKey } from "./locate.mjs";

const isMapped = (map, base) => map.keys[base] !== undefined && map.keys[base] !== "UNMAPPED";

function elementRow(c, key, expected) {
  const base = baseKey(key);
  const idx = isListKey(base) ? Number(key.match(/\[(\d+)\]$/)[1]) : 0;
  if (c.blocked) return { state: c.stateId, key, status: "UNMAPPED", reason: c.blocked };
  if (!isMapped(c.appMap, base)) return { state: c.stateId, key, status: "UNMAPPED", reason: "key not mapped for the app" };
  const actual = c.measured.found[base]?.[idx] ?? null;
  const tol = resolveTol({ specOpts: c.keyOptions[base], appTol: c.appMap.keys[base].tol, expected });
  const ctx = { key, state: c.stateId, deviations: c.deviations };
  const r = compareElement({ expected, actual, tol, ctx });
  const row = { state: c.stateId, key, status: r.status, checked: r.checked };
  if (r.props.length) row.props = r.props;
  if (!isListKey(base) && c.measured.counts[base] > 1) row.note = `locator matched ${c.measured.counts[base]} elements; first one measured`;
  return row;
}

function absentRow(c, key) {
  if (c.blocked) return { state: c.stateId, key, status: "UNMAPPED", reason: c.blocked };
  if (!isMapped(c.appMap, key)) return { state: c.stateId, key, status: "UNMAPPED", reason: "key not mapped for the app" };
  const present = Boolean(c.measured.found[key]?.[0]?.visible);
  if (!present) return { state: c.stateId, key, status: "PASS", checked: 1 };
  return { state: c.stateId, key, status: "FAIL", checked: 1, props: [{ prop: "visible", expected: false, actual: true, status: "FAIL" }] };
}

function countRow(c, listKey) {
  const rows = Object.entries(c.specState.elements).filter(([k]) => baseKey(k) === listKey);
  const expected = rows.filter(([, e]) => e.visible).length;
  if (c.blocked) return { state: c.stateId, key: listKey, status: "UNMAPPED", reason: c.blocked };
  if (!isMapped(c.appMap, listKey)) return { state: c.stateId, key: listKey, status: "UNMAPPED", reason: "key not mapped for the app" };
  const actual = (c.measured.found[listKey] ?? []).filter((e) => e.visible).length;
  const ok = expected === actual;
  const props = ok ? undefined : [{ prop: "visibleCount", expected, actual, status: "FAIL" }];
  return { state: c.stateId, key: listKey, status: ok ? "PASS" : "FAIL", checked: 1, ...(props && { props }) };
}

/**
 * ctx: { stateId, specState, appMap, keyOptions, deviations, measured, blocked }
 * `blocked` is a reason string when the state could not be driven (all rows UNMAPPED).
 */
export function buildRows(c) {
  const rows = Object.entries(c.specState.elements).map(([key, expected]) => elementRow(c, key, expected));
  rows.push(...c.specState.absent.map((key) => absentRow(c, key)));
  rows.push(...Object.keys(c.specState.lists).filter((k) => c.specState.lists[k] > 0).map((k) => countRow(c, k)));
  return rows;
}
