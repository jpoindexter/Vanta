import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLoopCommand } from "./loop-cmd.js";
import { listDefs, loadDef, loadState, saveState } from "../loop/store.js";
import { parseTrigger } from "./loop-cmd-build.js";
import { raiseEscalation } from "../loop/state.js";
import { dataDirFor } from "./ops.js";

// Capture console.log/error output in tests without polluting stdout.
function captureConsole(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a: unknown[]) => lines.push(a.map(String).join(" "));
  console.error = (...a: unknown[]) => lines.push(a.map(String).join(" "));
  return { lines, restore: () => { console.log = origLog; console.error = origErr; } };
}

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "loop-cmd-test-"));
});

// Cleanup is best-effort; test isolation is provided by unique tmp dirs.
async function cleanup() { await rm(root, { recursive: true, force: true }); }

describe("loop add", () => {
  it("creates a def and state", async () => {
    const cap = captureConsole();
    const code = await runLoopCommand(root, ["add", "ship the readme"]);
    cap.restore();
    expect(code).toBe(0);
    const defs = await listDefs(join(root, ".vanta"));
    expect(defs.length).toBe(1);
    expect(defs[0]!.goal).toBe("ship the readme");
    expect(defs[0]!.status).toBe("active");
    const state = await loadState(join(root, ".vanta"), defs[0]!.id);
    expect(state.iterations).toBe(0);
    await cleanup();
  });

  it("prints registered loop <id>", async () => {
    const cap = captureConsole();
    await runLoopCommand(root, ["add", "fix all tests"]);
    cap.restore();
    expect(cap.lines.join("\n")).toContain("registered loop");
    await cleanup();
  });

  it("accepts --id flag", async () => {
    const cap = captureConsole();
    await runLoopCommand(root, ["add", "custom goal", "--id", "my-loop"]);
    cap.restore();
    const def = await loadDef(join(root, ".vanta"), "my-loop");
    expect(def).not.toBeNull();
    expect(def?.id).toBe("my-loop");
    await cleanup();
  });

  it("two adds with the same goal get distinct ids", async () => {
    const cap = captureConsole();
    await runLoopCommand(root, ["add", "do the thing"]);
    await runLoopCommand(root, ["add", "do the thing"]);
    cap.restore();
    const defs = await listDefs(join(root, ".vanta"));
    const ids = defs.map((d) => d.id);
    expect(ids.length).toBe(2);
    expect(new Set(ids).size).toBe(2);
    await cleanup();
  });
});

describe("parseTrigger", () => {
  it("parses heartbeat:3 → everyTicks 3", () => {
    const t = parseTrigger("heartbeat:3");
    expect(t.kind).toBe("heartbeat");
    if (t.kind === "heartbeat") expect(t.everyTicks).toBe(3);
  });

  it("parses cron:\"0 9 * * *\" → kind cron", () => {
    const t = parseTrigger(`cron:"0 9 * * *"`);
    expect(t.kind).toBe("cron");
    if (t.kind === "cron") expect(t.expr).toBe("0 9 * * *");
  });

  it("parses manual → kind manual", () => {
    const t = parseTrigger("manual");
    expect(t.kind).toBe("manual");
  });

  it("defaults empty string to manual", () => {
    const t = parseTrigger("");
    expect(t.kind).toBe("manual");
  });

  it("parses bare heartbeat → everyTicks 1", () => {
    const t = parseTrigger("heartbeat");
    expect(t.kind).toBe("heartbeat");
    if (t.kind === "heartbeat") expect(t.everyTicks).toBe(1);
  });

  it("throws on unrecognised spec", () => {
    expect(() => parseTrigger("bogus:thing")).toThrow();
  });
});

describe("loop list", () => {
  it("prints no loops registered when empty", async () => {
    const cap = captureConsole();
    const code = await runLoopCommand(root, ["list"]);
    cap.restore();
    expect(code).toBe(0);
    expect(cap.lines.join("\n")).toContain("no loops registered");
    await cleanup();
  });

  it("output contains the registered id after add", async () => {
    const cap = captureConsole();
    await runLoopCommand(root, ["add", "test list output"]);
    cap.restore();

    const cap2 = captureConsole();
    await runLoopCommand(root, ["list"]);
    cap2.restore();
    expect(cap2.lines.join("\n")).toContain("test-list-output");
    await cleanup();
  });
});

describe("loop pause / resume / kill", () => {
  async function addLoop(goal = "manage status test"): Promise<string> {
    const cap = captureConsole();
    await runLoopCommand(root, ["add", goal]);
    cap.restore();
    const defs = await listDefs(join(root, ".vanta"));
    return defs[0]!.id;
  }

  it("pause sets status to paused", async () => {
    const id = await addLoop();
    const cap = captureConsole();
    const code = await runLoopCommand(root, ["pause", id]);
    cap.restore();
    expect(code).toBe(0);
    const def = await loadDef(join(root, ".vanta"), id);
    expect(def?.status).toBe("paused");
    await cleanup();
  });

  it("resume sets status to active", async () => {
    const id = await addLoop();
    const cap = captureConsole();
    await runLoopCommand(root, ["pause", id]);
    await runLoopCommand(root, ["resume", id]);
    cap.restore();
    const def = await loadDef(join(root, ".vanta"), id);
    expect(def?.status).toBe("active");
    await cleanup();
  });

  it("kill sets status to killed", async () => {
    const id = await addLoop();
    const cap = captureConsole();
    const code = await runLoopCommand(root, ["kill", id]);
    cap.restore();
    expect(code).toBe(0);
    const def = await loadDef(join(root, ".vanta"), id);
    expect(def?.status).toBe("killed");
    await cleanup();
  });

  it("kill --purge removes the files", async () => {
    const id = await addLoop();
    const cap = captureConsole();
    await runLoopCommand(root, ["kill", id, "--purge"]);
    cap.restore();
    const def = await loadDef(join(root, ".vanta"), id);
    expect(def).toBeNull();
    await cleanup();
  });
});

describe("loop show", () => {
  it("prints pretty JSON for a known id", async () => {
    const cap = captureConsole();
    await runLoopCommand(root, ["add", "show test goal", "--id", "show-test"]);
    cap.restore();

    const cap2 = captureConsole();
    const code = await runLoopCommand(root, ["show", "show-test"]);
    cap2.restore();
    expect(code).toBe(0);
    expect(cap2.lines.join("\n")).toContain("show test goal");
    await cleanup();
  });

  it("returns 1 for unknown id", async () => {
    const cap = captureConsole();
    const code = await runLoopCommand(root, ["show", "no-such-loop"]);
    cap.restore();
    expect(code).toBe(1);
    await cleanup();
  });
});

describe("loop run (unknown id)", () => {
  it("returns 1 for an unknown loop id", async () => {
    const cap = captureConsole();
    const code = await runLoopCommand(root, ["run", "definitely-does-not-exist"]);
    cap.restore();
    expect(code).toBe(1);
    await cleanup();
  });
});

describe("loop escalations", () => {
  async function addLoop(goal = "escalation test"): Promise<string> {
    const cap = captureConsole();
    await runLoopCommand(root, ["add", goal]);
    cap.restore();
    const defs = await listDefs(dataDirFor(root));
    return defs[0]!.id;
  }

  it("prints 'no escalations' when loop has none", async () => {
    const id = await addLoop();
    const cap = captureConsole();
    const code = await runLoopCommand(root, ["escalations", id]);
    cap.restore();
    expect(code).toBe(0);
    expect(cap.lines.join("\n")).toContain("no escalations");
    await cleanup();
  });

  it("returns 1 for unknown loop id", async () => {
    const cap = captureConsole();
    const code = await runLoopCommand(root, ["escalations", "no-such"]);
    cap.restore();
    expect(code).toBe(1);
    await cleanup();
  });

  it("output contains the reason when an escalation is seeded", async () => {
    const id = await addLoop();
    const dataDir = dataDirFor(root);
    const state = await loadState(dataDir, id);
    await saveState(dataDir, raiseEscalation(state, "needs key", new Date()));

    const cap = captureConsole();
    const code = await runLoopCommand(root, ["escalations", id]);
    cap.restore();
    expect(code).toBe(0);
    expect(cap.lines.join("\n")).toContain("needs key");
    await cleanup();
  });
});

describe("loop clear", () => {
  async function addPausedWithEsc(): Promise<{ id: string; dataDir: string }> {
    const cap = captureConsole();
    await runLoopCommand(root, ["add", "clear test"]);
    cap.restore();
    const dataDir = dataDirFor(root);
    const defs = await listDefs(dataDir);
    const id = defs[0]!.id;
    // Pause the loop and raise an escalation.
    const pauseCap = captureConsole();
    await runLoopCommand(root, ["pause", id]);
    pauseCap.restore();
    const state = await loadState(dataDir, id);
    await saveState(dataDir, raiseEscalation(state, "needs key", new Date()));
    return { id, dataDir };
  }

  it("clear returns 0 and resumes a paused loop with no remaining blockers", async () => {
    const { id, dataDir } = await addPausedWithEsc();
    const cap = captureConsole();
    const code = await runLoopCommand(root, ["clear", id, "esc-1"]);
    cap.restore();
    expect(code).toBe(0);
    expect(cap.lines.join("\n")).toContain("cleared esc-1");
    expect(cap.lines.join("\n")).toContain("loop resumed");
    const def = await loadDef(dataDir, id);
    expect(def?.status).toBe("active");
    await cleanup();
  });

  it("second clear on the same escalation returns 1", async () => {
    const { id } = await addPausedWithEsc();
    const cap = captureConsole();
    await runLoopCommand(root, ["clear", id, "esc-1"]);
    const code = await runLoopCommand(root, ["clear", id, "esc-1"]);
    cap.restore();
    expect(code).toBe(1);
    await cleanup();
  });

  it("clear on unknown loop returns 1", async () => {
    const cap = captureConsole();
    const code = await runLoopCommand(root, ["clear", "no-such", "esc-1"]);
    cap.restore();
    expect(code).toBe(1);
    await cleanup();
  });

  it("clear on unknown escId returns 1", async () => {
    const { id } = await addPausedWithEsc();
    const cap = captureConsole();
    const code = await runLoopCommand(root, ["clear", id, "esc-999"]);
    cap.restore();
    expect(code).toBe(1);
    await cleanup();
  });
});

describe("unknown subcommand", () => {
  it("prints usage and returns 1", async () => {
    const cap = captureConsole();
    const code = await runLoopCommand(root, ["bogus"]);
    cap.restore();
    expect(code).toBe(1);
    expect(cap.lines.join("\n").toLowerCase()).toContain("usage");
    await cleanup();
  });

  it("returns 1 with no subcommand", async () => {
    const cap = captureConsole();
    const code = await runLoopCommand(root, []);
    cap.restore();
    expect(code).toBe(1);
    await cleanup();
  });
});
