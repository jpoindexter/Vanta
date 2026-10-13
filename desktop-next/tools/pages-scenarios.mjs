// Shared by parity-pages.mjs and shoot-pages.mjs: every wireframe screen/state this
// track owns, how to reach it in the wireframe, and how to reach it in the fixtures harness.
export const WIDTHS = [1440, 1100, 800];
export const THEMES = ["light", "dark"];

// DOM clicks: the wireframe's handlers are delegated, and nav rows are hidden at 800.
const domClick = (sel) => (p) => p.evaluate((s) => document.querySelector(s).click(), sel);
const WIRE_VIEW = (view) => domClick(`#frame [data-view="${view}"]`);
const WIRE_TAB = (tab) => async (p) => { await p.click(`#pane-i .bar [data-wb="${tab}"]`); };

export const SCREENS = [
  { id: "home", wire: WIRE_VIEW("home"), query: "screen=home" },
  { id: "schedules", wire: WIRE_VIEW("schedules"), query: "screen=schedules" },
  { id: "connections", wire: WIRE_VIEW("connections"), query: "screen=connections" },
  { id: "skills", wire: WIRE_VIEW("skills"), query: "screen=skills" },
  { id: "outputs", wire: WIRE_VIEW("outputs"), query: "screen=outputs" },
  ...["changes", "files", "browser", "terminal", "outputs"].map((t) => ({
    id: `workbench-${t}`, wire: WIRE_TAB(t), query: `screen=workbench&tab=${t}`,
  })),
  { id: "palette", wire: async (p) => { await p.click("#b-pal"); }, query: "screen=palette" },
  { id: "palette-no-matches", wire: async (p) => { await p.click("#b-pal"); await p.fill("#palq", "zzz"); }, query: "screen=palette", built: async (p) => { await p.fill('[role="combobox"]', "zzz"); } },
  ...["general", "models", "permissions", "voice", "appearance"].map((s) => ({
    id: `settings-${s}`, wire: async (p) => { await p.click("#b-set"); },
    query: `screen=settings&section=${s}`, wireframeHasScreen: s === "general",
  })),
];

// Built-only states from the screen inventory (loading, empty, error, per block).
export const STATES = ["loading", "empty", "error"];
export const STATE_SCREENS = ["home", "schedules", "connections", "skills", "outputs",
  "workbench-changes", "workbench-files", "workbench-browser", "workbench-terminal", "workbench-outputs"];

// Pairs of [label, wireframe selector, built selector]; matched by document order.
const LIST = [
  ["page", "#frame .page", "#frame .vp-page"],
  ["column", "#frame .page .col", "#frame .vp-col"],
  ["header row", "#frame .page .sechead", "#frame .vp-sechead"],
  ["page title", "#frame .page .sechead h3", "#frame .vp-page-title"],
  ["page subtitle", "#frame .page .sechead p", "#frame .vp-sechead p"],
  ["primary CTA", "#frame .page .sechead > button", "#frame .vp-sechead > button"],
  ["row box", "#frame .page .box", "#frame .vp-box"],
  ["row", "#frame .page .list-row", "#frame .vp-row"],
  ["row note", "#frame .page .list-row .note", "#frame .vp-row .vp-note"],
  ["row action", "#frame .page .list-row button", "#frame .vp-row button"],
];
const HOME = [
  ["page", "#frame .page", "#frame .vp-page"],
  ["column", "#frame .page .col", "#frame .vp-col"],
  ["composer", "#frame .page .composer", "#frame .vp-composer"],
  ["composer textarea", "#frame .page .composer textarea", "#frame .vp-composer textarea"],
  ["composer tools", "#frame .page .composer .tools", "#frame .vp-composer .vp-tools"],
  ["attach button", "#frame .page .composer .icon", "#frame .vp-composer .vp-btn--icon"],
  ["send button", "#frame .page .composer .send", "#frame .vp-composer .vp-send"],
  ["project chip", "#frame .page .composer .chip", "#frame .vp-composer .vp-chip--menu"],
  ["project chips row", "#frame .page > .col > .chips", "#frame .vp-col > .vp-chips"],
  ["project chip (row)", "#frame .page > .col > .chips button", "#frame .vp-col > .vp-chips button"],
  ["section", "#frame .page .sec", "#frame .vp-sec"],
  ["section title", "#frame .page .sec h3", "#frame .vp-sec h3"],
  ["count badge", "#frame .page .sec .badge", "#frame .vp-sec .vp-badge"],
  ["row box", "#frame .page .box", "#frame .vp-box"],
  ["row", "#frame .page .list-row", "#frame .vp-row"],
  ["row note", "#frame .page .list-row .note", "#frame .vp-row .vp-note"],
  ["row action", "#frame .page .list-row button", "#frame .vp-row button"],
];
const WB = [
  ["workbench", "#frame .wb", "#frame .vp-wb"],
  ["tab bar", "#frame .wbtabs", "#frame .vp-wb__tabs"],
  ["tab", "#frame .wbtabs button", "#frame .vp-wb__tabs button"],
  ["body", "#frame .wbbody", "#frame .vp-wb__body"],
  ["row", "#frame .wbbody .list-row", "#frame .vp-wb__body .vp-row"],
  ["code block", "#frame .wbbody .code", "#frame .vp-wb__body .vp-code"],
  ["placeholder", "#frame .wbbody .ph", "#frame .vp-wb__body .vp-ph"],
  ["url bar", "#frame .wbbody .composer", "#frame .vp-wb__body .vp-urlbar"],
  ["action", "#frame .wbbody .acts button, #frame .wbbody .list-row button", "#frame .vp-wb__body .vp-acts button, #frame .vp-wb__body .vp-row button"],
];
const PALETTE = [
  ["scrim", "#frame .overlay", "#frame .vp-overlay"],
  ["sheet", "#frame .sheet", "#frame .vp-sheet"],
  ["input", "#frame .sheet input", "#frame .vp-sheet input"],
  ["option", "#frame .sheet .opt", "#frame .vp-opt"],
  ["option hint", "#frame .sheet .opt .muted", "#frame .vp-opt .vp-opt__hint"],
  ["no matches", "#frame .sheet p", "#frame .vp-list p"],
];
const SETTINGS = [
  ["scrim", "#frame .overlay", "#frame .vp-overlay"],
  ["sheet", "#frame .sheet", "#frame .vp-sheet"],
  ["header", "#frame .sheet .sechead", "#frame .vp-sheet__head"],
  ["title", "#frame .sheet .sechead b", "#frame .vp-sheet__title"],
  ["close", "#frame .sheet .sechead button", "#frame .vp-sheet__head button"],
  ["nav item", "#frame .sheet .nav", "#frame .vp-nav"],
  ["row box", "#frame .sheet .box", "#frame .vp-settings .vp-box"],
  ["row", "#frame .sheet .list-row", "#frame .vp-settings .vp-row"],
  ["row note", "#frame .sheet .list-row .note", "#frame .vp-settings .vp-row .vp-note"],
  ["row action", "#frame .sheet .list-row button", "#frame .vp-settings .vp-row button"],
];

export function pairsFor(id) {
  if (id === "home") return HOME;
  if (id.startsWith("workbench")) return WB;
  if (id.startsWith("palette")) return PALETTE;
  if (id.startsWith("settings")) return SETTINGS;
  return LIST;
}

// Differences that come from wireframe CSS artefacts, not design intent. A FAIL on a matching
// tag is reported as DEVIATION with the reason so the owner can overrule it.
export const KNOWN = [
  { tag: /workbench-(files|terminal|changes) \/ (code block|placeholder|row|action)/, reason: "wireframe .code lacks white-space:pre, so its multi-line text collapses to one line; built keeps the line breaks" },
  { tag: /^1100 home \/ (count badge|section title)/, reason: "wireframe rule .w1100 .badge{display:none} was written for the sidebar rail and also hides Home's Needs you badge; built keeps it" },
  { tag: /^1100 settings-general \/ nav item/, reason: "wireframe rule .w1100 .nav{padding:0;center} was written for the sidebar rail and also squeezes the settings nav; built keeps the 150px nav layout" },
];
