import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { effort } from "./effort-cmd.js";
import { modelSettings } from "./model-settings-cmd.js";
import { speed } from "./speed-cmd.js";
import type { ReplCtx } from "./types.js";
import { getCompletion } from "../agent/provider-call.js";
import type { AgentDeps } from "../agent/agent-types.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function ctx(providerId = "codex", modelId = "gpt-5.6-sol", root = "/tmp/vanta-tui-model-settings"): ReplCtx {
  return {
    dataDir: join(root, ".vanta"),
    state: { sessionId: "s1", started: "t0", turnIndex: 0, effortLevel: "medium" },
    setup: {
      effortLevel: "medium",
      provider: {
        modelId: () => modelId,
        routeInfo: () => ({ provider: providerId, model: modelId }),
      },
    },
    env: { CODEX_HOME: join(root, "missing-codex-home") },
  } as unknown as ReplCtx;
}

describe("TUI provider model settings commands", () => {
  it("sets Codex ultra and fast for this session without changing project env", async () => {
    const c = ctx();
    expect((await effort("ultra --session", c)).output).toContain("this session");
    expect((await speed("fast --session", c)).output).toContain("this session");
    expect(c.state.effortLevel).toBe("ultra");
    expect(c.setup.effortLevel).toBe("ultra");
    expect(c.state.serviceTier).toBe("fast");
    expect(c.setup.serviceTier).toBe("fast");
    expect(c.env.VANTA_EFFORT_LEVEL).toBeUndefined();
    expect(c.env.VANTA_SERVICE_TIER).toBeUndefined();
  });

  it("rejects unsupported Claude speed and ultra without partial mutation", async () => {
    const c = ctx("claude-code", "claude-sonnet-5");
    const fast = await speed("fast", c);
    const ultra = await effort("ultra", c);
    expect(fast.output).toContain("does not support speed fast");
    expect(ultra.output).toContain("does not support effort ultra");
    expect(c.state.effortLevel).toBe("medium");
    expect(c.state.serviceTier).toBeUndefined();
  });

  it("rejects conflicting scope flags without mutation", async () => {
    const c = ctx();
    const result = await speed("fast --session --global", c);
    expect(result.output).toContain("choose one scope");
    expect(c.state.serviceTier).toBeUndefined();
    expect(c.env.VANTA_SERVICE_TIER).toBeUndefined();
  });

  it("persists the current supported settings only after explicit project scope", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-tui-model-settings-"));
    roots.push(root);
    await mkdir(join(root, "vanta-ts"));
    const c = ctx("codex", "gpt-5.6-sol", root);
    await effort("high --session", c);
    await speed("fast --session", c);
    const result = await modelSettings("--global", c);
    const saved = await readFile(join(root, "vanta-ts", ".env"), "utf8");
    expect(result.output).toContain("project defaults");
    expect(saved).toContain("VANTA_EFFORT_LEVEL=high");
    expect(saved).toContain("VANTA_SERVICE_TIER=fast");
    expect(saved).not.toMatch(/TOKEN|API_KEY|AUTHORIZATION/);
  });

  it("keeps the session unchanged when a project-default write is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-tui-model-settings-missing-project-"));
    roots.push(root);
    const c = ctx("codex", "gpt-5.6-sol", root);
    const result = await effort("high --global", c);
    expect(result.output).toContain("ENOENT");
    expect(c.state.effortLevel).toBe("medium");
    expect(c.setup.effortLevel).toBe("medium");
    expect(c.env.VANTA_EFFORT_LEVEL).toBeUndefined();
  });

  it("sends the selected TUI settings on the next provider request", async () => {
    const c = ctx();
    await effort("ultra --session", c);
    await speed("fast --session", c);
    let received: unknown;
    const deps = {
      provider: {
        modelId: () => "gpt-5.6-sol",
        contextWindow: () => 100_000,
        complete: async (_messages: unknown, _tools: unknown, config: unknown) => {
          received = config;
          return { text: "ok", toolCalls: [], finishReason: "stop" };
        },
      },
      registry: { schemas: () => [] },
      root: "/tmp",
      getEffortLevel: () => c.state.effortLevel ?? c.setup.effortLevel,
      getServiceTier: () => c.state.serviceTier ?? c.setup.serviceTier,
    } as unknown as AgentDeps;

    await getCompletion(deps, [{ role: "user", content: "use the new settings" }], undefined, {
      ctx: { root: "/tmp", safety: {} as never, requestApproval: async () => true },
      prefetched: new Map(),
      schemas: [],
    });

    expect(received).toEqual(expect.objectContaining({ effortLevel: "ultra", serviceTier: "fast" }));
  });

  it("reports the current capabilities and an actionable recovery for unsupported providers", async () => {
    const codex = await modelSettings("", ctx());
    expect(codex.output).toContain("effort medium");
    expect(codex.output).toContain("speed standard");
    const ollama = await modelSettings("", ctx("ollama", "qwen"));
    expect(ollama.output).toContain("does not expose effort or speed settings");
    expect(ollama.output).toContain("/model");
  });
});
