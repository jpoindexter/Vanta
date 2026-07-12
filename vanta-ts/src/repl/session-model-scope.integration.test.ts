import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { model } from "./model-cmd.js";
import { resume } from "./session-cmds.js";
import { saveSession } from "../sessions/store.js";
import { resolveProvider } from "../providers/index.js";
import type { ReplCtx } from "./types.js";

describe("session-scoped model switching production path", () => {
  let root: string;
  let home: string;
  const globalEnv = (): NodeJS.ProcessEnv => ({ VANTA_HOME: home, VANTA_PROVIDER: "ollama", VANTA_MODEL: "global-model" });

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vanta-model-scope-root-"));
    home = await mkdtemp(join(tmpdir(), "vanta-model-scope-home-"));
    await mkdir(join(root, "vanta-ts"), { recursive: true });
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });

  function ctx(env: NodeJS.ProcessEnv): { value: ReplCtx; setProvider: ReturnType<typeof vi.fn> } {
    const setProvider = vi.fn();
    const value = {
      convo: { messages: [{ role: "system", content: "sys" }], setProvider },
      setup: { provider: resolveProvider(env) },
      dataDir: join(root, ".vanta"),
      state: { sessionId: "new", started: "2026-07-12T00:00:00Z", turnIndex: 0 },
      env,
      now: () => new Date("2026-07-12T00:00:00Z"),
    } as unknown as ReplCtx;
    return { value, setProvider };
  }

  it("switches one of two sessions, resumes both independently, and leaves the default untouched", async () => {
    const env = globalEnv();
    const first = ctx(env);
    const second = ctx(env);

    await model("ollama session-only --session", first.value);
    await saveSession("session-a", first.value.convo.messages, {
      env, providerId: first.value.state.providerId, modelId: first.value.state.modelId,
    });
    await saveSession("session-b", second.value.convo.messages, {
      env, providerId: "ollama", modelId: "global-model",
    });

    const resumedA = ctx(env);
    const resumedB = ctx(env);
    await resume("session-a", resumedA.value);
    await resume("session-b", resumedB.value);

    expect(resumedA.setProvider.mock.calls[0]?.[0].modelId()).toBe("session-only");
    expect(resumedB.setProvider.mock.calls[0]?.[0].modelId()).toBe("global-model");
    expect(env).toMatchObject({ VANTA_PROVIDER: "ollama", VANTA_MODEL: "global-model" });
    await expect(access(join(root, "vanta-ts", ".env"))).rejects.toThrow();
  });
});
