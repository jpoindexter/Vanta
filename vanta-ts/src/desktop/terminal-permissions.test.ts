import { Readable } from "node:stream";
import type http from "node:http";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleTerminal } from "./handler-approval.js";
import { resolveApproval } from "./approval.js";
import type { DesktopState } from "./handler-state.js";
import type { DesktopAccessMode } from "./access-mode.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import { grantAlways, grantNever } from "../permissions/grant.js";
import { shellCmdTool } from "../tools/shell-cmd.js";
import type { PendingApproval } from "./approval.js";

const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(mode: DesktopAccessMode, risk: "allow" | "ask" | "block") {
  const root = await mkdtemp(join(tmpdir(), "vanta-terminal-policy-")); roots.push(root);
  vi.stubEnv("VANTA_HOME", join(root, "home"));
  vi.stubEnv("VANTA_OPERATING_MODE", "default");
  vi.stubEnv("VANTA_PROJECT_ROOT", root);
  const execute = vi.fn(async () => ({ ok: true, output: "bounded test command" }));
  const registry = new InMemoryToolRegistry();
  registry.register({ ...shellCmdTool, execute });
  const safety = { assess: vi.fn(async () => ({ risk, reason: "fixture", needsHuman: risk === "ask" })), logEvent: vi.fn(async () => {}), proposeApproval: vi.fn(async () => "fixture-id"), approve: vi.fn(async () => {}), deny: vi.fn(async () => {}) };
  const state = { root, accessMode: mode, sessionId: "terminal-policy-fixture", providerId: "custom", modelId: "fixture", convo: { messages: [] }, setup: { registry, provider: { modelId: () => "fixture" }, safety } } as unknown as DesktopState;
  return { root, state, execute };
}

async function terminal(state: DesktopState, command = "echo bounded-test", onPrompt?: (p: PendingApproval) => Promise<void>) {
  const req = Readable.from([JSON.stringify({ command })]) as unknown as http.IncomingMessage;
  let body = "";
  const res = { writeHead() {}, end(value: string) { body = value; } } as unknown as http.ServerResponse;
  const task = handleTerminal(state, req, res);
  // Decline any unexpected prompt: tests must terminate, not hang on the old bug.
  const poll = setInterval(() => { if (state.pendingApproval) { const p = state.pendingApproval; state.pendingApproval = undefined; void (onPrompt ? onPrompt(p) : resolveApproval(p, "deny")); } }, 5);
  try { await task; return JSON.parse(body); } finally { clearInterval(poll); }
}

describe("Desktop terminal shared permission boundary", () => {
  it("honors a saved tool allow for routine kernel Ask", async () => {
    const { state, execute } = await fixture("ask", "ask"); await grantAlways("shell_cmd");
    expect((await terminal(state)).ok).toBe(true); expect(execute).toHaveBeenCalledOnce();
  });
  it("honors an explicit deny even under Full access and a kernel Allow", async () => {
    const { state, execute } = await fixture("full", "allow"); await grantNever("shell_cmd");
    expect((await terminal(state)).ok).toBe(false); expect(execute).not.toHaveBeenCalled();
  });
  it("honors Plan even with a saved allow", async () => {
    const { state, execute } = await fixture("plan", "allow"); await grantAlways("shell_cmd");
    expect((await terminal(state)).output).toMatch(/plan mode/i); expect(execute).not.toHaveBeenCalled();
  });
  it("honors Full access for routine kernel Ask", async () => {
    const { state, execute } = await fixture("full", "ask");
    expect((await terminal(state)).ok).toBe(true); expect(execute).toHaveBeenCalledOnce();
  });
  it("never overrides kernel Block", async () => {
    const { state, execute } = await fixture("full", "block"); await grantAlways("shell_cmd");
    expect((await terminal(state)).ok).toBe(false); expect(execute).not.toHaveBeenCalled();
  });
  it("retains fresh approval for outside-project mkdir under Full access", async () => {
    const { root, state, execute } = await fixture("full", "allow"); await grantAlways("shell_cmd");
    expect((await terminal(state, `mkdir '${root}-outside'`)).ok).toBe(false); expect(execute).not.toHaveBeenCalled();
  });
  it("approves exact plural outside-project targets once without a second gateway prompt", async () => {
    const { root, state, execute } = await fixture("full", "ask"); await grantAlways("shell_cmd");
    const prompts: PendingApproval[] = [];
    const result = await terminal(state, `mkdir '${root}-one' '${root}-two'`, async (p) => { prompts.push(p); await resolveApproval(p, "allow"); });
    expect(result.ok).toBe(true); expect(execute).toHaveBeenCalledOnce(); expect(prompts).toHaveLength(1);
    expect(prompts[0]?.detail?.fresh).toBe(true);
    expect(prompts[0]?.action).toContain(`${root}-one`); expect(prompts[0]?.action).toContain(`${root}-two`);
  });
  it("records a durable journal and receipt for an executed terminal action", async () => {
    const { root, state } = await fixture("full", "allow");
    expect((await terminal(state)).ok).toBe(true);
    const journal = join(root, ".vanta", "effect-journal");
    const files = await readdir(journal, { recursive: true });
    const text = (await Promise.all(files.filter((file) => /\.jsonl?$/.test(file)).map((file) => readFile(join(journal, file), "utf8")))).join("\n");
    for (const status of ["pending", "started", "settled"]) expect(text).toContain(status);
    expect(await readFile(join(root, ".vanta", "action-receipts.jsonl"), "utf8")).toContain("shell_cmd");
  });
  it("does not retry an ambiguous terminal failure", async () => {
    const { state, execute } = await fixture("full", "allow");
    execute.mockRejectedValueOnce(new Error("connection reset after dispatch"));
    const result = await terminal(state);
    expect(result).toMatchObject({ ok: false, effectDisposition: "unknown" }); expect(execute).toHaveBeenCalledOnce();
  });
});
