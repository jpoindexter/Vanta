import { describe, it, expect, vi } from "vitest";
import { access, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { model } from "./model-cmd.js";
import type { ReplCtx } from "./types.js";
import type { LLMProvider } from "../providers/interface.js";

function fakeProvider(id: string): LLMProvider {
  return {
    modelId: () => id,
    contextWindow: () => 32768,
    complete: async () => ({ text: "", toolCalls: [] }),
  } as unknown as LLMProvider;
}

async function makeCtx(env: NodeJS.ProcessEnv): Promise<{ ctx: ReplCtx; setProvider: ReturnType<typeof vi.fn>; repoRoot: string }> {
  const repoRoot = await mkdtemp(join(tmpdir(), "vanta-model-cmd-"));
  await mkdir(join(repoRoot, "vanta-ts"), { recursive: true });
  const setProvider = vi.fn();
  const ctx = {
    convo: { messages: [], setProvider } as unknown as ReplCtx["convo"],
    setup: { provider: fakeProvider("old-model") } as unknown as ReplCtx["setup"],
    dataDir: join(repoRoot, ".vanta"),
    state: {} as ReplCtx["state"],
    env,
    now: () => new Date(0),
  } as ReplCtx;
  return { ctx, setProvider, repoRoot };
}

describe("/model handler", () => {
  it("prints the active model when given no arg", async () => {
    const { ctx } = await makeCtx({});
    const r = await model("", ctx);
    expect(r.output).toContain("openai/old-model");
    expect(r.output).toContain("old-model");
    expect(r.output).toContain("32,768");
  });

  it("switches to an explicit keyless provider+model for this session without changing defaults", async () => {
    const env: NodeJS.ProcessEnv = { VANTA_PROVIDER: "ollama" };
    const { ctx, setProvider, repoRoot } = await makeCtx(env);
    const r = await model("ollama qwen2.5:14b", ctx);
    expect(setProvider).toHaveBeenCalledOnce();
    expect(ctx.setup.provider.modelId()).toBe("qwen2.5:14b");
    expect(ctx.state.providerId).toBe("ollama");
    expect(ctx.state.modelId).toBe("qwen2.5:14b");
    expect(env.VANTA_MODEL).toBeUndefined();
    await expect(access(join(repoRoot, "vanta-ts", ".env"))).rejects.toThrow();
    expect(r.output).toContain("qwen2.5:14b");
    expect(r.output).toContain("ollama/qwen2.5:14b");
    expect(r.output).toContain("this session");
    expect(r.provider?.modelId()).toBe("qwen2.5:14b"); // drives the TUI banner refresh
  });

  it("switches the model on the current provider when no provider prefix is given", async () => {
    const env: NodeJS.ProcessEnv = { VANTA_PROVIDER: "ollama" };
    const { ctx } = await makeCtx(env);
    await model("llama3.3", ctx);
    expect(ctx.state.providerId).toBe("ollama");
    expect(ctx.state.modelId).toBe("llama3.3");
    expect(env.VANTA_MODEL).toBeUndefined();
  });

  it("persists only when --global is explicit", async () => {
    const env: NodeJS.ProcessEnv = { VANTA_PROVIDER: "ollama", VANTA_MODEL: "global-old" };
    const { ctx, repoRoot } = await makeCtx(env);
    const r = await model("ollama qwen2.5:14b --global", ctx);
    expect(env.VANTA_MODEL).toBe("qwen2.5:14b");
    const written = await readFile(join(repoRoot, "vanta-ts", ".env"), "utf8");
    expect(written).toContain("VANTA_MODEL=qwen2.5:14b");
    expect(r.output).toContain("set as default");
  });

  it("reports an actionable failure for a keyed provider with no key (no swap)", async () => {
    const { ctx, setProvider } = await makeCtx({ VANTA_PROVIDER: "ollama" });
    const r = await model("anthropic claude-sonnet-4-6", ctx);
    expect(r.output).toMatch(/ANTHROPIC_API_KEY|failed/);
    expect(setProvider).not.toHaveBeenCalled();
  });

  it("says the prior route remains active when Claude Code auth expired", async () => {
    const env: NodeJS.ProcessEnv = { VANTA_PROVIDER: "codex" };
    const { ctx, setProvider, repoRoot } = await makeCtx(env);
    const claudeHome = join(repoRoot, "claude");
    await mkdir(claudeHome, { recursive: true });
    await writeFile(
      join(claudeHome, ".credentials.json"),
      JSON.stringify({ claudeAiOauth: { accessToken: "expired-token", expiresAt: 1 } }),
      "utf8",
    );
    ctx.env.CLAUDE_CONFIG_DIR = claudeHome;
    ctx.state.providerId = "codex";

    const r = await model("claude-code claude-sonnet-5", ctx);

    expect(r.output).toContain("switch not applied");
    expect(r.output).toContain("still using codex/old-model");
    expect(r.output).toContain("Claude Code token expired");
    expect(setProvider).not.toHaveBeenCalled();
    expect(ctx.state.providerId).toBe("codex");
  });
});
