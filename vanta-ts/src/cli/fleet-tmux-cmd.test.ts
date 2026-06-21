import { describe, it, expect } from "vitest";
import {
  shellQuote,
  buildWorkerCommand,
  tasksToTmuxWorkers,
  runFleetTmux,
} from "./fleet-tmux-cmd.js";
import type { TmuxRunner } from "../fleet/tmux-backend.js";

describe("shellQuote", () => {
  it("wraps a plain string in single quotes", () => {
    expect(shellQuote("echo hi")).toBe("'echo hi'");
  });
  it("escapes embedded single quotes (breakout-safe)", () => {
    expect(shellQuote("it's; rm -rf /")).toBe("'it'\\''s; rm -rf /'");
  });
});

describe("buildWorkerCommand", () => {
  it("cds into the repo and runs a one-shot worker with the quoted instruction", () => {
    expect(buildWorkerCommand("/repo", "do X")).toBe("cd '/repo' && ./run.sh run 'do X'");
  });
  it("a metacharacter-laden instruction is fully single-quoted, not interpolated", () => {
    const cmd = buildWorkerCommand("/r", "a; rm -rf / && echo $(whoami)");
    expect(cmd).toContain("./run.sh run 'a; rm -rf / && echo $(whoami)'");
  });
});

describe("tasksToTmuxWorkers", () => {
  it("maps each task to {id, launch command}", () => {
    const w = tasksToTmuxWorkers("/r", [
      { id: "1-a", instruction: "A" },
      { id: "2-b", instruction: "B" },
    ]);
    expect(w.map((x) => x.id)).toEqual(["1-a", "2-b"]);
    expect(w[0]!.command).toBe("cd '/r' && ./run.sh run 'A'");
  });
});

// A fake tmux that records calls + answers the id-printing ones (no real tmux).
function fakeTmux(): { run: TmuxRunner; calls: string[][] } {
  const calls: string[][] = [];
  let n = 0;
  const run: TmuxRunner = (argv) => {
    calls.push([...argv]);
    if (argv[0] === "-V") return "tmux 3.5";
    if (argv[0] === "list-panes") return "%0";
    if (argv[0] === "split-window") return `%${++n}`;
    return "";
  };
  return { run, calls };
}

describe("runFleetTmux", () => {
  it("no --task → usage + exit 1, no tmux spawned", () => {
    const { run, calls } = fakeTmux();
    const lines: string[] = [];
    const code = runFleetTmux("/r", [], (l) => lines.push(l), { run });
    expect(code).toBe(1);
    expect(lines.join("\n")).toMatch(/Usage: vanta fleet tmux/);
    expect(calls.some((c) => c[0] === "new-session")).toBe(false);
  });

  it("with tasks → spawns a pane per task, prints the attach command, exit 0", () => {
    const { run, calls } = fakeTmux();
    const lines: string[] = [];
    const code = runFleetTmux("/r", ["--task", "build A", "--task", "build B"], (l) => lines.push(l), {
      run,
      sessionId: "test",
    });
    expect(code).toBe(0);
    expect(calls.filter((c) => c[0] === "split-window")).toHaveLength(1); // 2 workers → 1 split
    const out = lines.join("\n");
    expect(out).toMatch(/spawned 2 worker pane\(s\) in tmux session "vanta-fleet-test"/);
    expect(out).toMatch(/tmux attach -t vanta-fleet-test/);
    // both worker launch commands were sent verbatim
    const sends = calls.filter((c) => c[0] === "send-keys");
    expect(sends[0]![3]).toBe("cd '/r' && ./run.sh run 'build A'");
  });

  it("tmux absent → clear install hint + exit 1 (no throw)", () => {
    const absent: TmuxRunner = () => {
      throw new Error("tmux: command not found");
    };
    const lines: string[] = [];
    const code = runFleetTmux("/r", ["--task", "x"], (l) => lines.push(l), { run: absent });
    expect(code).toBe(1);
    expect(lines.join("\n")).toMatch(/tmux not found/);
  });
});
