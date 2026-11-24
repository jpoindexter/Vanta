import { Readable } from "node:stream";
import type http from "node:http";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveApproval } from "./approval.js";
import { attachConversation } from "./handler-conversation.js";
import { handleAccessMode } from "./handler-status.js";
import type { DesktopState } from "./handler-state.js";
import type { DesktopAccessMode } from "./access-mode.js";
import type { RunSetup } from "../session.js";
import type { LLMProvider } from "../providers/interface.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import { editFileTool } from "../tools/edit-file.js";
import { grantAlways } from "../permissions/grant.js";
import { writeFileTool } from "../tools/write-file.js";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const exists = (path: string) => access(path).then(() => true, () => false);

/** A project whose kernel verdict for a file write is "ask": the floor every access mode is measured against. */
async function project() {
  const root = await mkdtemp(join(tmpdir(), "vanta-access-enforce-")); roots.push(root);
  vi.stubEnv("VANTA_HOME", join(root, "home"));
  vi.stubEnv("VANTA_OPERATING_MODE", "default");
  vi.stubEnv("VANTA_PERMISSION_MODE", "default");
  vi.stubEnv("VANTA_PROJECT_ROOT", root);
  const execute = vi.fn(writeFileTool.execute);
  const registry = new InMemoryToolRegistry();
  registry.register({ ...writeFileTool, execute });
  const safety = { assess: vi.fn(async () => ({ risk: "ask", reason: "fixture", needsHuman: true })), logEvent: vi.fn(async () => {}), proposeApproval: vi.fn(async () => "fixture-id"), approve: vi.fn(async () => {}), deny: vi.fn(async () => {}), getGoals: vi.fn(async () => []) };
  return { root, registry, safety, execute };
}

function scriptedProvider(): LLMProvider {
  let round = 0;
  return {
    complete: async () => {
      round += 1;
      if (round === 1) return { text: "", finishReason: "tool_calls", toolCalls: [{ id: "c1", name: "write_file", arguments: { path: "probe.md", content: "written" } }] };
      return { text: "Scripted turn finished.", toolCalls: [], finishReason: "stop" };
    },
    modelId: () => "fixture",
    contextWindow: () => 32_000,
  };
}

async function openState(mode: DesktopAccessMode | undefined) {
  const fx = await project();
  const setup = { registry: fx.registry, provider: scriptedProvider(), safety: fx.safety, goals: [], systemPrompt: "system" } as unknown as RunSetup;
  const state: DesktopState = { root: fx.root, sessionId: "access-enforce", setup, ...(mode ? { accessMode: mode } : {}) };
  attachConversation(state, setup);
  return { ...fx, state };
}

function call(state: DesktopState, method: "GET" | "POST", body?: unknown) {
  const req = Object.assign(Readable.from(body === undefined ? [] : [JSON.stringify(body)]), { method }) as unknown as http.IncomingMessage;
  let status = 0; let text = "";
  const res = { writeHead(next: number) { status = next; }, end(value: string) { text = value; } } as unknown as http.ServerResponse;
  return handleAccessMode(state, req, res).then(() => ({ status, body: JSON.parse(text) as Record<string, unknown> }));
}

/** Run one scripted turn. Any approval card is declined, and the number of cards is returned. */
async function turn(state: DesktopState) {
  let asked = 0;
  const poll = setInterval(() => {
    const pending = state.pendingApproval;
    if (!pending) return;
    asked += 1; state.pendingApproval = undefined; void resolveApproval(pending, "deny");
  }, 5);
  try { const outcome = await state.convo!.send("write probe.md"); return { outcome, asked }; } finally { clearInterval(poll); }
}

describe("desktop access mode is enforced by the server", () => {
  it("Plan refuses the write tool: it never runs and nothing is asked", async () => {
    const { state, execute, root } = await openState("ask");
    expect((await call(state, "POST", { mode: "plan" })).body).toMatchObject({ mode: "plan", scope: "project" });
    const { asked } = await turn(state);
    expect(execute).not.toHaveBeenCalled();
    expect(asked).toBe(0);
    expect(await exists(join(root, "probe.md"))).toBe(false);
  });

  it("Plan refuses edit_file even when an Always rule is saved for it", async () => {
    const { state, root, registry, safety } = await openState("ask");
    const edit = vi.fn(editFileTool.execute);
    registry.register({ ...editFileTool, execute: edit });
    await writeFile(join(root, "notes.md"), "before");
    await grantAlways("edit_file", process.env, root);
    let round = 0;
    const provider = { ...scriptedProvider(), complete: async () => (++round === 1
      ? { text: "", finishReason: "tool_calls", toolCalls: [{ id: "e1", name: "edit_file", arguments: { path: "notes.md", old_string: "before", new_string: "after" } }] }
      : { text: "done", toolCalls: [], finishReason: "stop" }) };
    const setup = { registry, provider, safety, goals: [], systemPrompt: "system" } as unknown as RunSetup;
    attachConversation(state, setup);
    await call(state, "POST", { mode: "plan" });
    await turn(state);
    expect(edit).not.toHaveBeenCalled();
    expect(await readFile(join(root, "notes.md"), "utf8")).toBe("before");
  });

  it("Manual asks before the write tool runs, and a declined ask leaves the file unwritten", async () => {
    const { state, execute, root } = await openState("plan");
    await call(state, "POST", { mode: "ask" });
    const { asked } = await turn(state);
    expect(asked).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    expect(await exists(join(root, "probe.md"))).toBe(false);
  });

  it("Accept edits runs the write tool without asking", async () => {
    const { state, execute, root } = await openState("ask");
    await call(state, "POST", { mode: "approve" });
    const { asked } = await turn(state);
    expect(asked).toBe(0);
    expect(execute).toHaveBeenCalledOnce();
    expect(await readFile(join(root, "probe.md"), "utf8")).toBe("written");
  });

  it("switching away from Plan lets the same chat write again", async () => {
    const { state, execute } = await openState("ask");
    await call(state, "POST", { mode: "plan" });
    await call(state, "POST", { mode: "full" });
    const { asked } = await turn(state);
    expect(asked).toBe(0);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("reaches every open chat of the project, not only the chat that made the change", async () => {
    const { state, execute, registry, safety, root } = await openState("ask");
    const peerSetup = { registry, provider: scriptedProvider(), safety, goals: [], systemPrompt: "system" } as unknown as RunSetup;
    const peer: DesktopState = { root, sessionId: "access-enforce-peer", setup: peerSetup, accessMode: "ask" };
    attachConversation(peer, peerSetup);
    state._sessions = new Map([["a", state], ["b", peer]]);
    await call(state, "POST", { mode: "plan" });
    expect(peer.accessMode).toBe("plan");
    const { asked } = await turn(peer);
    expect(asked).toBe(0);
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects an unknown mode and reports the project root on read", async () => {
    const { state, root } = await openState("ask");
    expect((await call(state, "POST", { mode: "yolo" })).status).toBe(400);
    expect((await call(state, "GET")).body).toEqual({ mode: "ask", scope: "project", root });
  });

  it("persists the mode in the project's settings.local.json so a restart keeps it", async () => {
    const { state, root } = await openState("ask");
    await call(state, "POST", { mode: "plan" });
    expect(JSON.parse(await readFile(join(root, ".vanta", "settings.local.json"), "utf8"))).toMatchObject({ desktop: { accessMode: "plan" } });
    const restarted: DesktopState = { root };
    const { loadDesktopAccessMode } = await import("./access-mode.js");
    restarted.accessMode = await loadDesktopAccessMode(root, {});
    expect(restarted.accessMode).toBe("plan");
  });
});
