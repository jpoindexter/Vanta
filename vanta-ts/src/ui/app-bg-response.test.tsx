import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { App } from "./app.js";
import { renderUi, tick, waitForFrame, waitUntil } from "./test-render.js";
import type { RunSetup } from "../session.js";
import type { AgentDeps, AgentOutcome, Conversation } from "../agent.js";

let finishSends: (() => void)[] = [];
let sendStarted = false;
let sendCompleted = false;
let sendCalls = 0;
let completedTexts: string[] = [];

function completeSend(index = 0): void {
  const finish = finishSends[index] as (() => void) | undefined;
  if (!finish) throw new Error("send did not expose a completion callback");
  finish();
}

vi.mock("../agent.js", () => ({
  createConversation: vi.fn((_systemPrompt: string, deps: AgentDeps): Conversation => {
    const conv: Conversation = {
      messages: [{ role: "system", content: "sys" }],
      send: async (text: string): Promise<AgentOutcome> => {
        sendStarted = true;
        sendCalls++;
        const callIndex = sendCalls - 1;
        conv.messages.push({ role: "user", content: text });
        deps.onTextDelta?.(`partial response ${text}`);
        await new Promise<void>((resolve) => { finishSends[callIndex] = resolve; });
        const finalText = text === "hello" ? "completed background response" : `completed foreground response: ${text}`;
        deps.onTextDelta?.(`\n${finalText}`);
        conv.messages.push({ role: "assistant", content: finalText });
        sendCompleted = true;
        completedTexts.push(text);
        return { finalText, iterations: 1, stoppedReason: "done", toolIterations: 0 };
      },
      setProvider: () => {},
      setSessionMemory: () => {},
    };
    return conv;
  }),
}));

function setup(): RunSetup {
  return {
    systemPrompt: "sys",
    provider: { modelId: () => "test-model", contextWindow: () => 100_000 } as never,
    safety: { getGoals: async () => [] } as never,
    registry: { schemas: () => [] } as never,
    pluginCommands: { list: () => [], get: () => undefined } as never,
    goals: [],
    effortLevel: "medium",
  };
}

describe("App /bg response continuation", () => {
  it("detaches an active response and attaches the completed answer later", async () => {
    finishSends = [];
    completedTexts = [];
    sendStarted = false;
    sendCompleted = false;
    sendCalls = 0;
    const inst = renderUi(h(App, { setup: setup(), repoRoot: mkdtempSync(join(tmpdir(), "vanta-bg-app-")) }));
    await tick();

    inst.input("hello");
    await tick();
    inst.input("\r");
    await waitUntil(() => sendStarted);
    await waitForFrame(inst, "partial response");

    inst.input("/bg");
    await tick();
    inst.input("\r");
    await waitForFrame(inst, "response moved to background");

    completeSend();
    await waitUntil(() => sendCompleted);

    inst.input("/bg");
    await tick();
    inst.input("\r");
    await waitForFrame(inst, "completed background response");
    inst.unmount();
  });

  it("sends normal messages while a detached response is still running", async () => {
    finishSends = [];
    completedTexts = [];
    sendStarted = false;
    sendCompleted = false;
    sendCalls = 0;
    const inst = renderUi(h(App, { setup: setup(), repoRoot: mkdtempSync(join(tmpdir(), "vanta-bg-queue-")) }));
    await tick();

    inst.input("hello");
    await tick();
    inst.input("\r");
    await waitUntil(() => sendStarted);

    inst.input("/bg");
    await tick();
    inst.input("\r");
    await waitForFrame(inst, "response moved to background");

    inst.input("sent while detached");
    await tick();
    inst.input("\r");
    await waitUntil(() => sendCalls === 2);

    completeSend(1);
    await waitForFrame(inst, "completed foreground response: sent while detached");
    completeSend(0);
    await waitUntil(() => completedTexts.includes("hello"));
    inst.unmount();
  });

  it("ctrl+b detaches and allows a new foreground message before the background finishes", async () => {
    finishSends = [];
    completedTexts = [];
    sendStarted = false;
    sendCompleted = false;
    sendCalls = 0;
    const inst = renderUi(h(App, { setup: setup(), repoRoot: mkdtempSync(join(tmpdir(), "vanta-bg-continue-")) }));
    await tick();

    inst.input("hello");
    await tick();
    inst.input("\r");
    await waitUntil(() => sendCalls === 1);
    await waitForFrame(inst, "partial response hello");

    inst.input("\x02");
    await waitForFrame(inst, "response moved to background");

    inst.input("foreground while detached");
    await tick();
    inst.input("\r");
    await waitUntil(() => sendCalls === 2);
    await waitForFrame(inst, "partial response foreground while detached");

    completeSend(1);
    await waitForFrame(inst, "completed foreground response: foreground while detached");

    completeSend(0);
    await waitUntil(() => completedTexts.includes("hello"));

    inst.input("\x02");
    await waitForFrame(inst, "completed background response");
    inst.unmount();
  });
});
