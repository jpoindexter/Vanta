import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import {
  classifyStack,
  formatRadar,
  scanProjectSignals,
} from "./radar.js";
import type { ProjectSignal } from "./radar.js";
import type { TaskStack } from "../task-stack/types.js";

// ── classifyStack (pure) ────────────────────────────────────────────────────

describe("classifyStack", () => {
  it("empty task list → idle", () => {
    const c = classifyStack({ tasks: [] });
    expect(c.signal).toBe("idle");
    expect(c.detail).toContain("no tasks");
    expect(c.lastSeen).toBeUndefined();
  });

  it("all closed or parked → idle", () => {
    const stack: TaskStack = {
      tasks: [
        makeTask({ status: "closed", updatedAt: "2026-06-01T00:00:00Z" }),
        makeTask({ status: "parked", updatedAt: "2026-06-02T00:00:00Z" }),
      ],
    };
    const c = classifyStack(stack);
    expect(c.signal).toBe("idle");
    expect(c.lastSeen).toBe("2026-06-02T00:00:00Z");
  });

  it("pending-only stack → active (not idle)", () => {
    const stack: TaskStack = {
      tasks: [makeTask({ status: "pending" })],
    };
    expect(classifyStack(stack).signal).toBe("active");
  });

  it("active task with near-done nextAction → near-done", () => {
    const stack: TaskStack = {
      tasks: [makeTask({ status: "active", nextAction: "ship the feature" })],
    };
    const c = classifyStack(stack);
    expect(c.signal).toBe("near-done");
    expect(c.detail).toContain("ship the feature");
  });

  it("near-done keywords: done, final, last, close", () => {
    for (const word of ["done writing tests", "final polish", "last step", "close PR"]) {
      const stack: TaskStack = {
        tasks: [makeTask({ status: "active", nextAction: word })],
      };
      expect(classifyStack(stack).signal).toBe("near-done");
    }
  });

  it("blocked task → blocked", () => {
    const stack: TaskStack = {
      tasks: [makeTask({ status: "blocked", blocker: "waiting on design" })],
    };
    const c = classifyStack(stack);
    expect(c.signal).toBe("blocked");
    expect(c.detail).toContain("waiting on design");
  });

  it("near-done wins over blocked when both present", () => {
    const stack: TaskStack = {
      tasks: [
        makeTask({ status: "active", nextAction: "ship it" }),
        makeTask({ status: "blocked", blocker: "external dep" }),
      ],
    };
    expect(classifyStack(stack).signal).toBe("near-done");
  });

  it("active task with no near-done keyword → active", () => {
    const stack: TaskStack = {
      tasks: [makeTask({ status: "active", nextAction: "write more tests" })],
    };
    expect(classifyStack(stack).signal).toBe("active");
  });

  it("lastSeen is the max updatedAt across tasks", () => {
    const stack: TaskStack = {
      tasks: [
        makeTask({ status: "active", updatedAt: "2026-05-01T00:00:00Z" }),
        makeTask({ status: "active", updatedAt: "2026-06-05T00:00:00Z" }),
        makeTask({ status: "active", updatedAt: "2026-04-01T00:00:00Z" }),
      ],
    };
    expect(classifyStack(stack).lastSeen).toBe("2026-06-05T00:00:00Z");
  });
});

// ── formatRadar (pure) ──────────────────────────────────────────────────────

describe("formatRadar", () => {
  it("empty signals → 'no projects found'", () => {
    expect(formatRadar([])).toBe("no projects found");
  });

  it("includes roomId in each line", () => {
    const signals: ProjectSignal[] = [
      { roomId: "vanta", name: "vanta", signal: "active", detail: "2 active task(s) (git: clean)" },
      { roomId: "brutal", name: "brutal", signal: "idle", detail: "no tasks (git: clean)" },
    ];
    const out = formatRadar(signals);
    expect(out).toContain("vanta");
    expect(out).toContain("brutal");
  });

  it("uses correct emojis per signal", () => {
    const signals: ProjectSignal[] = [
      { roomId: "a", name: "a", signal: "idle", detail: "d" },
      { roomId: "b", name: "b", signal: "blocked", detail: "d" },
      { roomId: "c", name: "c", signal: "near-done", detail: "d" },
      { roomId: "d", name: "d", signal: "active", detail: "d" },
    ];
    const out = formatRadar(signals);
    expect(out).toContain("🟡 a");
    expect(out).toContain("🔴 b");
    expect(out).toContain("🟢 c");
    expect(out).toContain("● d");
  });

  it("shows lastSeen date when provided", () => {
    const signals: ProjectSignal[] = [
      {
        roomId: "proj",
        name: "proj",
        signal: "active",
        detail: "1 active task(s) (git: clean)",
        lastSeen: "2026-06-07T12:00:00Z",
      },
    ];
    expect(formatRadar(signals)).toContain("[2026-06-07]");
  });

  it("omits date bracket when lastSeen is absent", () => {
    const signals: ProjectSignal[] = [
      { roomId: "x", name: "x", signal: "idle", detail: "none" },
    ];
    expect(formatRadar(signals)).not.toContain("[");
  });
});

// ── scanProjectSignals (integration, temp fs) ───────────────────────────────

describe("scanProjectSignals", () => {
  let base: string;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "vanta-radar-"));
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it("empty dir → []", async () => {
    expect(await scanProjectSignals(base)).toEqual([]);
  });

  it("missing dir → []", async () => {
    expect(await scanProjectSignals(join(base, "nope"))).toEqual([]);
  });

  it("project with no .vanta dir → idle (empty stack)", async () => {
    await mkdir(join(base, "myproject"));
    const signals = await scanProjectSignals(base);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.signal).toBe("idle");
    expect(signals[0]!.roomId).toBe("myproject");
  });
});

// ── helpers ─────────────────────────────────────────────────────────────────

let _seq = 0;
function makeTask(
  overrides: Partial<import("../task-stack/types.js").OperatorTask> = {},
): import("../task-stack/types.js").OperatorTask {
  _seq++;
  return {
    id: `task-${_seq}`,
    title: `Task ${_seq}`,
    status: "active",
    source: "user",
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
    why: "test",
    ...overrides,
  };
}
