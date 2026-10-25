import type http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { registerStripThinking } from "../agent/message-display.js";
import { globalHookBus } from "../plugins/hooks.js";
import type { CompletionResult, LLMProvider } from "../providers/interface.js";
import type { RunSetup } from "../session.js";
import { loadSession } from "../sessions/store.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import type { DesktopRunReceipt } from "../types.js";
import { handleChat } from "./handler-chat.js";
import { attachConversation } from "./handler-conversation.js";
import { desktopTurnQueues, queuedTurnTarget, turnQueue } from "./handler-queue.js";
import type { DesktopState } from "./handler-state.js";

const roots: string[] = [];
const unsubscribe: (() => void)[] = [];
afterEach(async () => {
  unsubscribe.splice(0).forEach(off => off());
  desktopTurnQueues.clear();
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

const reply = (text: string): CompletionResult => ({ text, toolCalls: [], finishReason: "stop" });
const toolReply = (text: string, id = "one"): CompletionResult => ({ text, finishReason: "tool_calls",
  toolCalls: [{ id, name: "fixture_read", arguments: { source: id } }] });

async function fixture(results: (CompletionResult | Error)[]) {
  const root = await mkdtemp(join(tmpdir(), "vanta-displayed-checkpoint-")); roots.push(root);
  vi.stubEnv("VANTA_HOME", join(root, "home"));
  vi.stubEnv("VANTA_PROJECT_ROOT", root);
  vi.stubEnv("VANTA_MAX_ITER", "5");
  vi.stubEnv("VANTA_AUTOCONTINUE", "1");
  vi.stubEnv("VANTA_VERIFY", "0");
  vi.stubEnv("VANTA_PERMISSION_MODE", "default");
  vi.stubEnv("VANTA_OPERATING_MODE", "default");
  const complete = vi.fn(async () => {
    const next = results.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error("script exhausted");
    return next;
  });
  const provider: LLMProvider = { modelId: () => "fixture", contextWindow: () => 100_000, complete };
  const registry = new InMemoryToolRegistry();
  registry.register({ schema: { name: "fixture_read", description: "Read a bounded fixture", parameters: { type: "object" } },
    execute: async () => ({ ok: true, output: "Public fixture result" }) });
  const safety = { assess: vi.fn(async () => ({ risk: "allow", reason: "fixture", needsHuman: false })),
    logEvent: vi.fn(async () => {}), getGoals: vi.fn(async () => []) };
  const setup = { registry, provider, safety, goals: [], systemPrompt: "Fixture" } as unknown as RunSetup;
  const state: DesktopState = { root, setup, sessionId: "displayed", accessMode: "ask" };
  attachConversation(state, setup);
  return { state, provider, complete };
}

async function send(state: DesktopState, instruction: string) {
  const req = Readable.from([JSON.stringify({ message: instruction, sessionId: state.sessionId })]) as http.IncomingMessage;
  let status = 0; let raw = "";
  const res = { writeHead(value: number) { status = value; }, end(value: string) { raw = value; } } as http.ServerResponse;
  await handleChat(state, req, res);
  expect(status).toBe(200);
  return JSON.parse(raw) as { finalText: string; stoppedReason: string; receipt: DesktopRunReceipt };
}

async function persistedReceipt(state: DesktopState) {
  const restored = await loadSession(state.sessionId!, { VANTA_HOME: join(state.root, "home") });
  const last = restored?.messages.at(-1);
  return last?.role === "assistant" ? last.desktopRun : undefined;
}

it.each(["rewrite", "suppress"] as const)("keeps only producer-displayed non-stream text after message_display %s", async mode => {
  const { state, provider, complete } = await fixture([
    toolReply("<thinking>private raw thought</thinking>Checked source A."), reply("Blocked: source B unavailable.")
  ]);
  unsubscribe.push(mode === "rewrite" ? registerStripThinking(globalHookBus)
    : globalHookBus.on("message_display", () => ({ action: "suppress" })));
  const response = await send(state, "Research the sources");
  const expected = mode === "rewrite" ? "Checked source A.\n\nBlocked: source B unavailable." : undefined;
  expect(provider.stream).toBeUndefined();
  expect(complete).toHaveBeenCalledTimes(2);
  expect(response.stoppedReason).toBe("blocked");
  expect(response.receipt.checkpoint).toEqual({ instruction: "Research the sources", ...(expected ? { partialText: expected } : {}) });
  expect((await persistedReceipt(state))?.checkpoint).toEqual(response.receipt.checkpoint);
  expect(JSON.stringify(state.convo!.messages)).toContain("private raw thought");
  expect(JSON.stringify(response.receipt)).not.toContain("private raw thought");
  expect(state._instructionDisplayedText).toBeUndefined();
});

it("keeps displayed work before the real synthetic-user continuation inside the external send", async () => {
  const { state, complete } = await fixture([
    toolReply("<thinking>private raw thought</thinking>Checked source A."),
    reply("I will now inspect source B."), reply("Blocked: source B unavailable.")
  ]);
  unsubscribe.push(registerStripThinking(globalHookBus));
  const response = await send(state, "Research the sources");
  expect(complete).toHaveBeenCalledTimes(3);
  const users = state.convo!.messages.filter(message => message.role === "user");
  expect(users).toHaveLength(2);
  expect(users.at(-1)!.content).not.toBe("Research the sources");
  expect(response.receipt.checkpoint).toEqual({ instruction: "Research the sources",
    partialText: "Checked source A.\n\nI will now inspect source B.\n\nBlocked: source B unavailable." });
  expect((await persistedReceipt(state))?.checkpoint).toEqual(response.receipt.checkpoint);
});

it("resets displayed capture for an actual queued send and clears it after chat cleanup", async () => {
  const { state, complete } = await fixture([
    toolReply("First displayed work."), reply("First request complete."),
    toolReply("Second displayed work.", "two"), reply("Blocked: second source unavailable.")
  ]);
  await turnQueue(state).enqueue({ instruction: "Queued second request", target: queuedTurnTarget(state) });
  const response = await send(state, "First external request");
  expect(complete).toHaveBeenCalledTimes(4);
  expect(response.receipt.checkpoint).toEqual({ instruction: "Queued second request",
    partialText: "Second displayed work.\n\nBlocked: second source unavailable." });
  expect(JSON.stringify(response.receipt.checkpoint)).not.toContain("First");
  expect((await persistedReceipt(state))?.checkpoint).toEqual(response.receipt.checkpoint);
  expect(state._instructionDisplayedText).toBeUndefined();
  expect((await turnQueue(state).list(state.sessionId!)).items).toHaveLength(1);
});

it("does not repurpose displayed capture as exception-path stream deltas", async () => {
  const { state } = await fixture([toolReply("Displayed before failure."), new Error("hard provider failure")]);
  const response = await send(state, "Read the source");
  expect(response.stoppedReason).toBe("failed");
  expect(response.finalText).toBe("hard provider failure");
  expect(response.receipt.checkpoint).toEqual({ instruction: "Read the source" });
  expect(state._instructionDisplayedText).toBeUndefined();
  expect(state._chatDeltas).toBeUndefined();
});
