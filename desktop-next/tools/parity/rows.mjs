// Turn one measured state into report rows: one row per wireframe element,
// one per key the wireframe says must be absent, one visible-count row per list.
import { compareElement, findDeviation, findDeviations, resolveTol, visibility } from "./compare.mjs";
import { baseKey, isListKey } from "./locate.mjs";

const isMapped = (map, base) => map.keys[base] !== undefined && map.keys[base] !== "UNMAPPED";

/** A declared "no counterpart in the app" deviation covering this key and state, if any. */
function notApplicable(c, key, base) {
  if (isMapped(c.appMap, base)) return undefined;
  return c.deviations.find((d) => d.na && findDeviation([d], { key, state: c.stateId, prop: "*" }));
}

function naRow(c, key, dev) {
  return { state: c.stateId, key, status: "ALLOWED", checked: 0, props: [{ prop: "na", status: "ALLOWED", deviation: dev.id }] };
}

function unmappedRow(c, key, base) {
  const dev = notApplicable(c, key, base);
  if (dev) return naRow(c, key, dev);
  if (c.blocked) return { state: c.stateId, key, status: "UNMAPPED", reason: c.blocked };
  return isMapped(c.appMap, base) ? null : { state: c.stateId, key, status: "UNMAPPED", reason: "key not mapped for the app" };
}

function elementRow(c, key, expected) {
  const base = baseKey(key);
  const idx = isListKey(base) ? Number(key.match(/\[(\d+)\]$/)[1]) : 0;
  const skipped = unmappedRow(c, key, base);
  if (skipped) return skipped;
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
  const skipped = unmappedRow(c, key, key);
  if (skipped) return skipped;
  const present = Boolean(c.measured.found[key]?.[0]?.visible);
  if (!present) return { state: c.stateId, key, status: "PASS", checked: 1 };
  const prop = visibility({ key, state: c.stateId, deviations: c.deviations }, false, true);
  return { state: c.stateId, key, status: prop.status, checked: 1, props: [prop] };
}

function countRow(c, listKey) {
  const rows = Object.entries(c.specState.elements).filter(([k]) => baseKey(k) === listKey);
  const expected = rows.filter(([, e]) => e.visible).length;
  const skipped = unmappedRow(c, listKey, listKey);
  if (skipped) return skipped;
  const actual = (c.measured.found[listKey] ?? []).filter((e) => e.visible).length;
  if (expected === actual) return { state: c.stateId, key: listKey, status: "PASS", checked: 1 };
  const dev = findDeviations(c.deviations, { key: listKey, state: c.stateId, prop: "visibleCount" }).find((d) => d.transform === "ignore");
  const status = dev ? "ALLOWED" : "FAIL";
  return { state: c.stateId, key: listKey, status, checked: 1, props: [{ prop: "visibleCount", expected, actual, status, ...(dev && { deviation: dev.id }) }] };
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
