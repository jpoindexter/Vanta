import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDashboard } from "./dashboard-cmd.js";
import type { ReplCtx } from "./types.js";
import { appendRouteUsage } from "../cost/route-ledger.js";

// Helpers to build a minimal ReplCtx with controlled task-stack + goals.

type SafetyStub = {
  getGoals: () => Promise<{ id: number; text: string; status: "active" | "done" }[]>;
  getApprovals: () => Promise<unknown[]>;
};

function makeCtx(
  dataDir: string,
  opts: { goals?: SafetyStub["getGoals"]; approvals?: SafetyStub["getApprovals"] } = {},
): ReplCtx {
  return {
    convo: { messages: [] },
    setup: {
      registry: { schemas: () => [] },
      provider: { modelId: () => "test-model", contextWindow: () => 128_000 },
      safety: {
        getGoals: opts.goals ?? (async () => []),
        getApprovals: opts.approvals ?? (async () => []),
        addGoal: async () => true,
        completeGoal: async () => true,
      },
      goals: [],
      systemPrompt: "sys",
    },
    dataDir,
    state: { sessionId: "s1", started: "t0", turnIndex: 0 },
    env: {} as NodeJS.ProcessEnv,
    now: () => new Date("2026-06-08T00:00:00.000Z"),
  } as unknown as ReplCtx;
}

async function writeTaskStack(
  dataDir: string,
  tasks: object[],
): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, "task-stack.json"), JSON.stringify({ tasks }, null, 2), "utf8");
}

// Use a temp dir that is NOT inside the Vanta repo so git status doesn't report
// real working-tree changes and the "clean" path is exercised correctly.
let tmpBase: string;

beforeEach(async () => {
  tmpBase = await mkdtemp(join(tmpdir(), "vanta-dashboard-"));
});
afterEach(async () => {
  await rm(tmpBase, { recursive: true, force: true });
});

describe("buildDashboard — all-clear", () => {
  it("returns all-clear when stack is empty, no goals, and git is clean", async () => {
    const dataDir = join(tmpBase, ".vanta");
    const ctx = makeCtx(dataDir);
    const out = await buildDashboard(ctx);
    expect(out).toContain("No active tasks, no active goals, clean repo.");
    expect(out).toContain("What Vanta can do now");
  });

  it("shows actual served routes even when the task dashboard is otherwise clear", async () => {
    const dataDir = join(tmpBase, ".vanta");
    await appendRouteUsage(dataDir, {
      callId: "r1", sessionId: "s1", agent: "interactive",
      route: { provider: "codex", model: "gpt-5.5", baseRoute: "subscription://openai-codex", billingMode: "included", fallbackDepth: 1 },
      usage: { inputTokens: 10, outputTokens: 2 },
    });
    const out = await buildDashboard(makeCtx(dataDir));
    expect(out).toContain("Model Routes");
    expect(out).toContain("codex/gpt-5.5");
    expect(out).toContain("fallback:1");
  });
});

describe("buildDashboard — active task", () => {
  it("shows the active task title in the output", async () => {
    const dataDir = join(tmpBase, ".vanta");
    await writeTaskStack(dataDir, [
      {
        id: "aaaa-1111-bbbb-2222-cccc",
        title: "Ship OPERATOR-DASHBOARD",
        status: "active",
        source: "user",
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
        why: "Users need a glance view.",
      },
    ]);
    const ctx = makeCtx(dataDir);
    const out = await buildDashboard(ctx);
    expect(out).toContain("Ship OPERATOR-DASHBOARD");
    expect(out).toContain("Active Task");
  });

  it("includes nextAction when present", async () => {
    const dataDir = join(tmpBase, ".vanta");
    await writeTaskStack(dataDir, [
      {
        id: "aaaa-1111-bbbb-2222-dddd",
        title: "Refactor prompt tier",
        status: "active",
        source: "user",
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
        why: "Too long.",
        nextAction: "Extract brainDigest tier",
      },
    ]);
    const ctx = makeCtx(dataDir);
    const out = await buildDashboard(ctx);
    expect(out).toContain("Extract brainDigest tier");
  });
});

describe("buildDashboard — blocked tasks", () => {
  it("shows blocked task name in blocked section", async () => {
    const dataDir = join(tmpBase, ".vanta");
    await writeTaskStack(dataDir, [
      {
        id: "bbbb-2222-cccc-3333-eeee",
        title: "Deploy to production",
        status: "blocked",
        source: "user",
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
        why: "Needed by ops.",
        blocker: "Waiting for infra cert",
      },
    ]);
    const ctx = makeCtx(dataDir);
    const out = await buildDashboard(ctx);
    expect(out).toContain("Deploy to production");
    expect(out).toContain("Blocked");
  });

  it("shows blocked count when multiple tasks are blocked", async () => {
    const dataDir = join(tmpBase, ".vanta");
    await writeTaskStack(dataDir, [
      {
        id: "cccc-1111-dddd-2222-aaaa",
        title: "Task Alpha",
        status: "blocked",
        source: "user",
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
        why: "Blocked.",
        blocker: "Reason A",
      },
      {
        id: "cccc-1111-dddd-2222-bbbb",
        title: "Task Beta",
        status: "blocked",
        source: "user",
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
        why: "Blocked.",
        blocker: "Reason B",
      },
    ]);
    const ctx = makeCtx(dataDir);
    const out = await buildDashboard(ctx);
    expect(out).toContain("2 blocked");
  });
});

describe("buildDashboard — goals", () => {
  it("shows active goal text", async () => {
    const dataDir = join(tmpBase, ".vanta");
    await writeTaskStack(dataDir, [
      {
        id: "dddd-0000-1111-2222-aaaa",
        title: "Some task",
        status: "pending",
        source: "user",
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
        why: "Reason.",
      },
    ]);
    const ctx = makeCtx(dataDir, {
      goals: async () => [{ id: 1, text: "Ship v1 parity", status: "active" }],
    });
    const out = await buildDashboard(ctx);
    expect(out).toContain("Ship v1 parity");
    expect(out).toContain("Goals");
  });
});

describe("buildDashboard — approvals", () => {
  it("shows pending approval count when approvals exist", async () => {
    const dataDir = join(tmpBase, ".vanta");
    const ctx = makeCtx(dataDir, {
      goals: async () => [{ id: 2, text: "Active goal", status: "active" }],
      approvals: async () => [{ id: 1 }, { id: 2 }],
    });
    const out = await buildDashboard(ctx);
    expect(out).toContain("2 pending approval");
  });
});
