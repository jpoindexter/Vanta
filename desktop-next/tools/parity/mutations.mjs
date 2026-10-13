// Deliberate wireframe mutations for the negative test. `find` must occur exactly once.
// `assert(pairs, run)` receives Map<"key:prop", states[]> of FAIL rows and judges the result.

const sameSet = (pairs, want) => pairs.size === want.length && want.every((w) => pairs.has(w));

export const MUTATIONS = [
  {
    id: "label",
    description: 'approval button label "Allow once" -> "Approve once"',
    find: 'data-ap="once">Allow once</button>',
    replace: 'data-ap="once">Approve once</button>',
    assert: (pairs, run) => {
      const ok = sameSet(pairs, ["card.approval.allowOnce:text"]) && run.copyRows.some((c) => c.status === "FAIL");
      return { ok, why: ok ? "only card.approval.allowOnce:text failed; its width/x shift stayed inside the hug/flow tolerance; copy inventory flagged it" : `unexpected FAIL set: ${[...pairs.keys()].join(", ")}` };
    },
  },
  {
    id: "radius",
    description: "composer radius 22px -> 18px",
    find: ".composer{border:1px solid var(--line);border-radius:22px;",
    replace: ".composer{border:1px solid var(--line);border-radius:18px;",
    assert: (pairs) => {
      const ok = sameSet(pairs, ["composer:radius", "home.composer:radius"]);
      return { ok, why: ok ? "only the two composer keys failed, on radius" : `unexpected FAIL set: ${[...pairs.keys()].join(", ")}` };
    },
  },
  {
    id: "sidebar-280",
    description: "sidebar column 275px -> 280px at 1440 (the 1100 and 800 layouts are untouched)",
    find: ".body{display:grid;min-height:0;grid-template-columns:275px minmax(0,1fr) auto}",
    replace: ".body{display:grid;min-height:0;grid-template-columns:280px minmax(0,1fr) auto}",
    assert: (pairs) => {
      const sidebarStates = pairs.get("sidebar:w") ?? [];
      const only1440 = [...pairs.values()].flat().every((s) => s.startsWith("w1440."));
      const ok = sidebarStates.length > 0 && sidebarStates.every((s) => s.startsWith("w1440.")) && only1440;
      return { ok, why: ok ? "sidebar:w failed in every 1440 state (plus its real knock-on rows); nothing failed at 1100/800" : `sidebar:w states=${sidebarStates.length}, other widths affected=${!only1440}` };
    },
  },
];
