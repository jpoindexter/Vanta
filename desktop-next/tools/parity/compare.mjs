// Pure comparison of one wireframe element against one measured app element.

export const DEFAULT_TOL = { x: 2, y: 2, w: 1, h: 1, fontSize: 0.5, radius: 1, border: 0.5 };
const HUG_MIN_PX = 6;
const HUG_RATIO = 0.12;
const FLOW_X_PX = 24;
const GLYPHS = /[＋⌕⌂◷⇄✦▤▲✕◌▸▾○✓⚙⋯±◎↑■☰🎙👍👎•]|>_/gu;

export const stripGlyphs = (s) => s.replace(GLYPHS, "").replace(/\s+/g, " ").trim();

const toPx = (t, expected) => (typeof t === "string" ? (parseFloat(t) / 100) * Math.abs(expected ?? 0) : t);

/** Merge default < wireframe hints (hug/flow/tol) < app-map tol, resolved to pixels for this element. */
export function resolveTol({ specOpts = {}, appTol = {}, expected }) {
  const merged = { ...DEFAULT_TOL };
  if (specOpts.hug) merged.w = Math.max(HUG_MIN_PX, HUG_RATIO * (expected.w ?? 0));
  if (specOpts.flow) merged.x = FLOW_X_PX;
  Object.assign(merged, specOpts.tol ?? {}, appTol);
  return Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, toPx(v, expected[k])]));
}

export const globToRe = (glob) => new RegExp(`^${glob.split("*").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);

/** Every declared deviation covering (key, state, prop), in file order. */
export function findDeviations(deviations, { key, state, prop }) {
  return deviations.filter(
    (d) =>
      !d.copy &&
      (d.props.includes("*") || d.props.includes(prop)) &&
      (!d.keys || d.keys.some((g) => globToRe(g).test(key))) &&
      (!d.states || d.states.some((g) => globToRe(g).test(state))),
  );
}

/** The first declared deviation covering (key, state, prop), or undefined. */
export const findDeviation = (deviations, where) => findDeviations(deviations, where)[0];

const sameGlyphless = (a, b) => typeof a === "string" && typeof b === "string" && stripGlyphs(a) === stripGlyphs(b);

/** Does this deviation excuse `actual` for a wireframe value of `expected`? */
function excuses(dev, prop, expected, actual, equal) {
  if (dev.transform === "ignore") return true;
  if (dev.transform === "stripGlyphs") return sameGlyphless(expected, actual);
  const delta = dev.shift?.[prop];
  return dev.transform === "shift" && delta !== undefined && typeof expected === "number" && equal(expected + delta, actual);
}

function judge(ctx, prop, expected, actual, equal) {
  if (equal(expected, actual)) return { prop, status: "PASS" };
  const base = { prop, expected, actual: actual ?? null };
  const devs = findDeviations(ctx.deviations, { key: ctx.key, state: ctx.state, prop: prop.split(".")[0] });
  const dev = devs.find((d) => excuses(d, prop, expected, actual, equal));
  return dev ? { ...base, status: "ALLOWED", deviation: dev.id } : { ...base, status: "FAIL" };
}

const within = (tol) => (a, b) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= tol + 1e-9;
const same = (a, b) => a === b;

function numericProps(ctx, expected, actual, tol) {
  const out = [];
  for (const prop of ["x", "y", "w", "h", "fontSize", "radius"]) {
    if (expected[prop] !== undefined) out.push(judge(ctx, prop, expected[prop], actual[prop], within(tol[prop])));
  }
  if (expected.fontWeight !== undefined) out.push(judge(ctx, "fontWeight", expected.fontWeight, actual.fontWeight, same));
  if (expected.border) {
    expected.border.forEach((v, i) => out.push(judge(ctx, `border.${["top", "right", "bottom", "left"][i]}`, v, actual.border?.[i], within(tol.border))));
  }
  return out;
}

function textProps(ctx, expected, actual) {
  const out = [];
  if (expected.text !== undefined) out.push(judge(ctx, "text", expected.text, actual.text ?? "", same));
  if (expected.placeholder !== undefined) out.push(judge(ctx, "placeholder", expected.placeholder, actual.placeholder ?? "", same));
  for (const prop of ["filled", "color", "bg"]) {
    if (expected[prop] !== undefined) out.push(judge(ctx, prop, expected[prop], actual[prop], same));
  }
  for (const [name, value] of Object.entries(expected.aria ?? {})) {
    out.push(judge(ctx, `aria.${name}`, value, actual.aria?.[name], same));
  }
  return out;
}

/** A visibility difference, ALLOWED only when a declared "ignore" deviation covers this key and state. */
export function visibility(ctx, expected, actual) {
  const dev = findDeviations(ctx.deviations ?? [], { key: ctx.key, state: ctx.state, prop: "visible" }).find((d) => d.transform === "ignore");
  const row = { prop: "visible", expected, actual };
  return dev ? { ...row, status: "ALLOWED", deviation: dev.id } : { ...row, status: "FAIL" };
}

const worst = (props) =>
  props.some((p) => p.status === "FAIL") ? "FAIL" : props.some((p) => p.status === "ALLOWED") ? "ALLOWED" : "PASS";

/**
 * Compare one element. `actual` is null when the app has no such element.
 * Returns { status, checked, props } where props lists only non-PASS results.
 */
export function compareElement({ expected, actual, tol, ctx }) {
  const hiddenOk = !expected.visible;
  const appVisible = Boolean(actual?.visible);
  if (hiddenOk) {
    const props = appVisible ? [visibility(ctx, false, true)] : [];
    return { status: worst(props), checked: 1, props };
  }
  if (!appVisible) {
    const props = [visibility(ctx, true, actual ? "hidden" : "absent")];
    return { status: worst(props), checked: 1, props };
  }
  const all = [...numericProps(ctx, expected, actual, tol), ...textProps(ctx, expected, actual)];
  return { status: worst(all), checked: all.length + 1, props: all.filter((p) => p.status !== "PASS") };
}
