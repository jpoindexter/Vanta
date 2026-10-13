// Runs inside the page: measure one element for the listed props, relative to `mainSel`.
export function collectInPage({ sel, mainSel, props }) {
  const ICONS = /[▲▸▾✕◌✓○＋🎙■↑▤±◎⌂⌕⇄✦◷👍👎⌘\u2800-\u28ff]/g;
  const clean = (s) => (s || "").replace(ICONS, "").replace(/\s+/g, " ").trim();
  const px = (v) => Math.round(parseFloat(v) * 10) / 10;
  const main = document.querySelector(mainSel);
  const el = document.querySelector(sel);
  if (!el || !main) return { missing: true };
  const r = el.getBoundingClientRect();
  const m = main.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const out = {};
  const effectiveOpacity = (node) => {
    let o = 1;
    for (let n = node; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
    return Math.round(o * 100) / 100;
  };
  const buttons = () => [...el.querySelectorAll("button, [role=button], summary")].filter((b) => b.getBoundingClientRect().width > 0);
  for (const p of props) {
    switch (p) {
      case "width": out[p] = Math.round(r.width * 10) / 10; break;
      case "height": out[p] = Math.round(r.height * 10) / 10; break;
      case "centeredOffset": out[p] = Math.round(((r.left + r.width / 2) - (m.left + m.width / 2)) * 10) / 10; break;
      case "borderRadius": {
        const raw = cs.borderTopLeftRadius;
        const v = raw.includes("%") ? (parseFloat(raw) / 100) * Math.min(r.width, r.height) : parseFloat(raw);
        out[p] = Math.round(Math.min(v, Math.min(r.width, r.height) / 2) * 10) / 10;
        break;
      }
      case "borderWidth": out[p] = px(cs.borderTopWidth); break;
      case "paddingTop": case "paddingRight": case "paddingBottom": case "paddingLeft": out[p] = px(cs[p]); break;
      case "fontSize": out[p] = px(cs.fontSize); break;
      case "fontWeight": out[p] = Number(cs.fontWeight); break;
      case "lineHeight": out[p] = cs.lineHeight === "normal" ? "normal" : px(cs.lineHeight); break;
      case "text": out[p] = clean(el.innerText); break;
      case "textAlign": out[p] = cs.textAlign === "start" ? "left" : cs.textAlign; break;
      case "alignRight": {
        const col = el.closest("[data-vp=column], .col") || main;
        const c = col.getBoundingClientRect();
        out[p] = Math.abs(c.right - r.right) <= 1.5;
        break;
      }
      case "maxWidthPct": {
        const col = el.closest("[data-vp=column], .col") || main;
        out[p] = r.width <= col.getBoundingClientRect().width * 0.8 + 1;
        break;
      }
      case "noBackground": out[p] = /rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) && px(cs.borderTopWidth) === 0; break;
      case "ariaExpanded": out[p] = (el.getAttribute("aria-expanded") ?? el.querySelector("[aria-expanded]")?.getAttribute("aria-expanded")) ?? "none"; break;
      case "ariaLabel": out[p] = el.getAttribute("aria-label") ?? el.querySelector("[aria-label]")?.getAttribute("aria-label") ?? ""; break;
      case "placeholder": out[p] = el.placeholder || el.getAttribute("data-placeholder") || el.querySelector("[data-placeholder]")?.getAttribute("data-placeholder") || ""; break;
      case "buttonTexts": out[p] = buttons().map((b) => clean(b.innerText || b.getAttribute("aria-label"))).join(" | "); break;
      case "buttonHeight": out[p] = buttons()[0] ? Math.round(buttons()[0].getBoundingClientRect().height * 10) / 10 : 0; break;
      case "gap": { const b = buttons(); out[p] = b.length > 1 ? Math.round((b[1].getBoundingClientRect().left - b[0].getBoundingClientRect().right) * 10) / 10 : 0; break; }
      case "hiddenAtRest": out[p] = effectiveOpacity(el) === 0; break;
      case "shownOnHover": out[p] = null; break; // filled by the driver after hovering
      default: out[p] = `unknown:${p}`;
    }
  }
  return out;
}
