// In-page measurement. `probeElements` and `copyStrings` are serialised into the
// page by Playwright, so they must stay self-contained (no imports, no closures).
import { isListKey, keyLocator, locatorFor } from "./locate.mjs";

/** Describe each element the same way for the wireframe and for the built app. */
export function probeElements(els, ctx) {
  const round = (n) => Math.round(n * 100) / 100;
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const IMPLICIT = { button: "button", textarea: "textbox", main: "main", aside: "complementary", nav: "navigation", h1: "heading", h2: "heading", h3: "heading", h4: "heading" };
  const transform = (cs, t) => (cs.textTransform === "uppercase" ? t.toUpperCase() : cs.textTransform === "lowercase" ? t.toLowerCase() : t);
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ");
  const opts = { checkOpacity: !ctx.ignoreOpacity, opacityProperty: !ctx.ignoreOpacity, checkVisibilityCSS: true, visibilityProperty: true };

  // Geometry first; decorative text (spinner frames) is hidden only while text is read, so it never moves a box.
  const rawText = (el) => (ctx.textMode === "none" ? "" : ctx.textMode === "own" ? ownText(el) : (el.innerText ?? el.textContent ?? ""));
  const hidden = ctx.textIgnore ? [...document.querySelectorAll(ctx.textIgnore)] : [];
  const texts = (() => {
    const saved = hidden.map((n) => n.style.display);
    hidden.forEach((n) => (n.style.display = "none"));
    const read = els.map(rawText);
    hidden.forEach((n, i) => (n.style.display = saved[i]));
    return read;
  })();

  return els.map((el, index) => {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const visible = el.checkVisibility(opts);
    const out = { visible, display: cs.display };
    if (!visible) return out;
    const sc = ctx.scale;
    const w = rect.width / sc;
    const h = rect.height / sc;
    Object.assign(out, { x: round((rect.x - ctx.frame.x) / sc), y: round((rect.y - ctx.frame.y) / sc), w: round(w), h: round(h) });

    const text = norm(transform(cs, texts[index]));
    if (text) Object.assign(out, { text, fontSize: round(parseFloat(cs.fontSize)), fontWeight: Number(cs.fontWeight) || 400 });
    const ph = el.getAttribute("placeholder") ?? el.getAttribute("data-placeholder");
    if (ph) out.placeholder = norm(ph);

    const first = cs.borderTopLeftRadius.split(" ")[0];
    const half = Math.min(w, h) / 2;
    const rad = first.endsWith("%") ? (parseFloat(first) / 100) * Math.min(w, h) : parseFloat(first);
    out.radius = round(Math.min(rad || 0, half));
    out.border = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map((v) => round(parseFloat(v) || 0));
    const bg = cs.backgroundColor.match(/[\d.]+/g) ?? [];
    out.filled = bg.length < 4 ? bg.length === 3 : Number(bg[3]) > 0;
    out.color = cs.color;
    out.bg = cs.backgroundColor;

    const aria = {};
    for (const a of el.attributes) if (a.name.startsWith("aria-")) aria[a.name] = a.value;
    const role = el.getAttribute("role") ?? (el.tagName === "A" && el.hasAttribute("href") ? "link" : IMPLICIT[el.tagName.toLowerCase()]);
    if (role) aria.role = role;
    if (Object.keys(aria).length) out.aria = aria;
    return out;
  });
}

/** Visible strings under `root` in DOM order, with CSS text-transform applied. */
export function copyStrings(rootEl, textIgnore) {
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const transform = (cs, t) => (cs.textTransform === "uppercase" ? t.toUpperCase() : cs.textTransform === "lowercase" ? t.toLowerCase() : t);
  const root = rootEl;
  const rest = [];
  const hover = [];
  const push = (el, text) => {
    if (!text) return;
    const atRest = el.checkVisibility({ checkOpacity: true, opacityProperty: true, checkVisibilityCSS: true, visibilityProperty: true });
    const shown = el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true });
    if (atRest) rest.push(text);
    else if (shown) hover.push(text);
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (el && textIgnore && el.closest(textIgnore)) continue;
    if (el && !["SCRIPT", "STYLE", "TEXTAREA"].includes(el.tagName)) push(el, norm(transform(getComputedStyle(el), n.textContent)));
  }
  for (const el of root.querySelectorAll("[placeholder],[aria-label]")) {
    const ph = el.getAttribute("placeholder");
    const label = el.tagName === "BUTTON" || el.getAttribute("role") === "button" ? el.getAttribute("aria-label") : null;
    if (ph) push(el, `[placeholder] ${norm(ph)}`);
    if (label) push(el, `[aria-label] ${norm(label)}`);
  }
  return { rest, hover };
}

async function frameInfo(page, map) {
  const fn = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + el.clientLeft, y: r.y + el.clientTop, w: el.clientWidth, h: el.clientHeight, scale: el.offsetWidth ? r.width / el.offsetWidth : 1 };
  };
  if (!map.frame) return page.evaluate(() => ({ x: 0, y: 0, w: innerWidth, h: innerHeight, scale: 1 }));
  return locatorFor(page, map, map.frame).first().evaluate(fn);
}

/** Measure every mapped key on the current page. Returns { frame, found: {key: Element[]}, counts: {key: n}, unmapped: [] }. */
export async function measureAll(page, map, options) {
  const frame = await frameInfo(page, map);
  const ctxBase = { frame, scale: frame.scale };
  const found = {};
  const counts = {};
  const unmapped = [];
  for (const key of options.keys) {
    const loc = keyLocator(page, map, key);
    if (!loc) {
      unmapped.push(key);
      continue;
    }
    const entry = map.keys[key];
    const ctx = { ...ctxBase, textIgnore: map.textIgnore ?? "", textMode: entry.textMode ?? "all", ignoreOpacity: options.hoverOnlyKeys.has(key) || entry.hoverOnly === true };
    const all = await loc.evaluateAll(probeElements, ctx);
    found[key] = isListKey(key) ? all : all.slice(0, 1);
    counts[key] = all.length;
  }
  return { frame, found, counts, unmapped };
}

/** Visible strings for the copy inventory. */
export async function measureCopy(page, map) {
  const root = map.copyRoot ? locatorFor(page, map, map.copyRoot).first() : page.locator("body");
  return root.evaluate(copyStrings, map.textIgnore ?? "");
}
