// The state matrix. Single source of truth for which states the spec contains.
// A state is a viewport width plus an ordered set of facets ("kind:value");
// each facet is driven by one entry in a selector map's `drivers`.

export const FRAME_HEIGHT = 900;

export const FACET_ORDER = ["w", "theme", "drawer", "view", "chat", "wb", "extra", "overlay"];

const CHAT_STATES = ["empty", "running", "waiting", "blocked", "done", "failed", "offline"];
const WB_TABS = ["changes", "files", "browser", "terminal", "outputs"];
const VIEWS = ["home", "schedules", "connections", "skills", "outputs"];

function state(w, name, facets, theme = "light") {
  return { id: `w${w}.${name}`, w, theme, facets: [`w:${w}`, ...facets] };
}

function fullWidthStates() {
  return [
    ...CHAT_STATES.map((c) => state(1440, `chat-${c}`, [`chat:${c}`])),
    ...WB_TABS.map((t) => state(1440, `wb-${t}`, ["chat:waiting", `wb:${t}`])),
    ...VIEWS.map((v) => state(1440, `view-${v}`, [`view:${v}`])),
    state(1440, "palette", ["chat:waiting", "overlay:palette"]),
    state(1440, "palette-empty", ["chat:waiting", "overlay:paletteEmpty"]),
    state(1440, "settings", ["chat:waiting", "overlay:settings"]),
    state(1440, "dark-waiting", ["chat:waiting", "theme:dark"], "dark"),
    state(1440, "waiting-step-open", ["chat:waiting", "extra:stepOpen"]),
    state(1440, "running-queued", ["chat:running", "extra:queued"]),
    state(1440, "waiting-toast-always", ["chat:waiting", "extra:toastAlways"]),
  ];
}

function narrowStates() {
  const out = [];
  for (const w of [1100, 800]) {
    out.push(
      state(w, "chat-waiting", ["chat:waiting"]),
      state(w, "chat-empty", ["chat:empty"]),
      state(w, "wb-changes", ["chat:waiting", "wb:changes"]),
      state(w, "view-home", w === 800 ? ["drawer:open", "view:home"] : ["view:home"]),
      state(w, "settings", ["chat:waiting", "overlay:settings"]),
    );
  }
  out.push(
    state(800, "drawer-waiting", ["chat:waiting", "drawer:open"]),
    state(800, "palette", ["chat:waiting", "overlay:palette"]),
  );
  return out;
}

export const STATES = [...fullWidthStates(), ...narrowStates()];

/** Sort facets into the order the drivers must run in. */
export function orderFacets(facets) {
  const rank = (f) => FACET_ORDER.indexOf(f.split(":")[0]);
  return [...facets].sort((a, b) => rank(a) - rank(b));
}
