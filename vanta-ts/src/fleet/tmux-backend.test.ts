import { describe, it, expect } from "vitest";
import {
  spawnTmuxSwarm,
  killTmuxSwarm,
  capturePaneText,
  countPanes,
  tmuxAvailable,
  realTmuxRunner,
  type TmuxRunner,
} from "./tmux-backend.js";

// A fake tmux that records every invocation and answers the id-printing calls,
// so the orchestration sequence is fully testable with NO real tmux.
function fakeTmux(): { run: TmuxRunner; calls: string[][] } {
  const calls: string[][] = [];
  let paneSeq = 0;
  const run: TmuxRunner = (argv) => {
    calls.push([...argv]);
    if (argv[0] === "list-panes") return "%0";
    if (argv[0] === "split-window") return `%${++paneSeq}`; // each split yields a new id
    return "";
  };
  return { run, calls };
}

describe("spawnTmuxSwarm (orchestration, injected tmux)", () => {
  it("places one pane per worker: session + send-keys for pane 0, split+send for the rest", () => {
    const { run, calls } = fakeTmux();
    const res = spawnTmuxSwarm({
      sessionName: "s",
      workers: [
        { id: "a", command: "vanta run A" },
        { id: "b", command: "vanta run B" },
        { id: "c", command: "vanta run C" },
      ],
      run,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.panes.map((p) => p.workerId)).toEqual(["a", "b", "c"]);
    expect(res.panes.map((p) => p.paneId)).toEqual(["%0", "%1", "%2"]); // pane0 + 2 splits
    // exactly N-1 split-window calls for N workers
    expect(calls.filter((c) => c[0] === "split-window")).toHaveLength(2);
    // each worker's command was sent verbatim as a single argv element
    const sends = calls.filter((c) => c[0] === "send-keys");
    expect(sends).toHaveLength(3);
    expect(sends.map((c) => c[3])).toEqual(["vanta run A", "vanta run B", "vanta run C"]);
  });

  it("assigns a distinct color per pane", () => {
    const { run } = fakeTmux();
    const res = spawnTmuxSwarm({
      sessionName: "s",
      workers: [
        { id: "a", command: "x" },
        { id: "b", command: "y" },
      ],
      run,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.panes[0]!.color).not.toBe(res.panes[1]!.color);
  });

  it("an injection-shaped command stays ONE argv element (never shell-split)", () => {
    const { run, calls } = fakeTmux();
    spawnTmuxSwarm({ sessionName: "s", workers: [{ id: "a", command: "echo hi; rm -rf /" }], run });
    const send = calls.find((c) => c[0] === "send-keys");
    expect(send?.[3]).toBe("echo hi; rm -rf /"); // intact, not re-split
  });

  it("no workers → {ok:false}; a tmux failure → {ok:false}, never throws", () => {
    expect(spawnTmuxSwarm({ sessionName: "s", workers: [], run: fakeTmux().run })).toEqual({
      ok: false,
      error: "no workers to place",
    });
    const throwing: TmuxRunner = () => {
      throw new Error("tmux exploded");
    };
    const res = spawnTmuxSwarm({ sessionName: "s", workers: [{ id: "a", command: "x" }], run: throwing });
    expect(res.ok).toBe(false);
  });
});

// ── LIVE integration: drive the REAL tmux binary. Skips cleanly where tmux is
// absent (CI), so the suite stays green everywhere; where tmux exists it PROVES
// the backend actually spawns panes and runs commands — not a stub.
const HAS_TMUX = tmuxAvailable();

describe.skipIf(!HAS_TMUX)("spawnTmuxSwarm (LIVE tmux)", () => {
  const session = `vanta_test_swarm_${process.pid}`;

  it("spawns 3 real panes and each worker's command actually runs in its pane", async () => {
    killTmuxSwarm(session); // pre-clean any leftover
    try {
      const res = spawnTmuxSwarm({
        sessionName: session,
        workers: [
          { id: "w0", command: "echo MARK0" },
          { id: "w1", command: "echo MARK1" },
          { id: "w2", command: "echo MARK2" },
        ],
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      // three real panes exist in the live session
      expect(countPanes(session)).toBe(3);

      // each pane actually ran its command — poll capture-pane for the echoed marker
      for (let i = 0; i < res.panes.length; i++) {
        const pane = res.panes[i]!;
        const want = `MARK${i}`;
        let seen = "";
        for (let tries = 0; tries < 25 && !seen.includes(want); tries++) {
          seen = capturePaneText(pane.paneId);
          if (!seen.includes(want)) await new Promise((r) => setTimeout(r, 60));
        }
        expect(seen).toContain(want); // the command genuinely executed in the real pane
      }
    } finally {
      killTmuxSwarm(session);
    }
  });

  it("killTmuxSwarm removes the session (countPanes → 0)", () => {
    spawnTmuxSwarm({ sessionName: session, workers: [{ id: "w", command: "echo X" }] });
    expect(countPanes(session)).toBeGreaterThan(0);
    expect(killTmuxSwarm(session)).toBe(true);
    expect(countPanes(session)).toBe(0);
  });
});

// Guardrail: this dev machine HAS tmux, so the live block must not be silently
// skipped here (it would mask a regression). Elsewhere (no tmux) skipping is fine.
it("reports tmux availability (live block runs where tmux exists)", () => {
  expect(typeof HAS_TMUX).toBe("boolean");
  // realTmuxRunner is the real binary seam; if tmux is present it answers -V.
  if (HAS_TMUX) expect(realTmuxRunner(["-V"])).toMatch(/tmux/);
});
