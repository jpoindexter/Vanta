import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type http from "node:http";
import { decide } from "../ui/approval-prompt.js";
import { requestApprovalWithTaskScope, TaskApprovalScope, type Pending } from "../ui/task-approval.js";
import { requestWebApproval, resolveApproval, type PendingApproval } from "../desktop/approval.js";
import { handleApproval } from "../desktop/handler-approval.js";
import { createDesktopLaunchGate } from "../desktop/company-run-runtimes.js";
import { runTurn } from "./turn-loop.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import type { AgentDeps } from "./agent-types.js";
import { grantAlways } from "../permissions/grant.js";
import { loadRules, saveRules } from "../permissions/store.js";
import { canonicalRoot, matchRule } from "../permissions/rules.js";

const io = vi.hoisted(() => ({ afterWrite: undefined as undefined | (() => Promise<void>), afterPublish: undefined as undefined | (() => void) }));
vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, renameSync: (...args: Parameters<typeof actual.renameSync>) => {
    actual.renameSync(...args);
    if (String(args[1]).endsWith("permissions.tsv")) { const notify = io.afterPublish; io.afterPublish = undefined; notify?.(); }
  } };
});
vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
    await actual.writeFile(...args);
    if (String(args[0]).includes("permissions.tsv.") && io.afterWrite) await io.afterWrite();
  } };
});

function pauseWrite() {
  let written!: () => void, release!: () => void;
  const ready = new Promise<void>(resolve => { written = resolve; });
  const resumed = new Promise<void>(resolve => { release = resolve; });
  io.afterWrite = async () => { io.afterWrite = undefined; written(); await resumed; };
  return { written: ready, release };
}

describe("saved approval cancellation through real hosts and rule storage", () => {
  let home: string, root: string, original: string;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-saved-choice-"));
    root = join(home, "project"); await mkdir(root);
    root = canonicalRoot(root);
    vi.stubEnv("VANTA_HOME", home);
    await saveRules([{ action: "ask", tool: "browser_read", root }, { action: "deny", tool: "shell_cmd", pattern: "private" }]);
    original = await readFile(join(home, "permissions.tsv"), "utf8");
  });
  afterEach(async () => { io.afterWrite = undefined; io.afterPublish = undefined; vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(home, { recursive: true, force: true }); });

  function tui() {
    const controller = new AbortController();
    let pending: Pending | null = null;
    const answer = requestApprovalWithTaskScope({ taskApprovals: new TaskApprovalScope(),
      setPending: value => { pending = typeof value === "function" ? value(pending) : value; },
      action: "read public page", reason: "fixture", toolName: "browser_read", root, detail: { signal: controller.signal } });
    expect(pending).not.toBeNull();
    return { controller, answer, pending: pending! };
  }

  it.each(["always", "never"] as const)("TUI canceled %s cannot publish the already-written temporary preference", async outcome => {
    const { controller, answer, pending } = tui(), pause = pauseWrite();
    const operation = decide(pending, outcome);
    try { await pause.written; controller.abort(); } finally { pause.release(); }
    expect(await answer).toBe(false); expect(await operation).toBe(false);
    expect(await readFile(join(home, "permissions.tsv"), "utf8")).toBe(original);
    expect((await readdir(home)).filter(file => file.startsWith("permissions.tsv."))).toEqual([]);
    expect(matchRule(await loadRules(), "browser_read", "read public page", root)).toBe("ask");
  });

  it.each(["always", "never"] as const)("Desktop canceled %s cannot publish a temporary preference", async outcome => {
    const controller = new AbortController();
    const host: { root: string; pendingApproval?: PendingApproval } = { root };
    const answer = requestWebApproval(host, "read public page", "fixture", { toolName: "browser_read", detail: { signal: controller.signal } });
    const pending = host.pendingApproval!, pause = pauseWrite();
    host.pendingApproval = undefined; // The real HTTP handler claims a request before awaiting its save.
    const operation = resolveApproval(pending, outcome).then(() => null, error => error);
    try { await pause.written; controller.abort(); } finally { pause.release(); }
    await operation;
    expect(await answer).toBe(false);
    expect(await readFile(join(home, "permissions.tsv"), "utf8")).toBe(original);
    expect((await readdir(home)).filter(file => file.startsWith("permissions.tsv."))).toEqual([]);
  });

  it("a canceled queued choice preserves the other request's legitimate saved rule", async () => {
    const pause = pauseWrite(), first = grantAlways("read_file", process.env, root);
    await pause.written;
    const { controller, answer, pending } = tui(), second = decide(pending, "always");
    controller.abort(); pause.release();
    await first; expect(await second).toBe(false); expect(await answer).toBe(false);
    const rules = await loadRules();
    expect(matchRule(rules, "read_file", "read fixture", root)).toBe("allow");
    expect(matchRule(rules, "browser_read", "read public page", root)).toBe("ask");
    expect(rules).toContainEqual({ action: "deny", tool: "shell_cmd", pattern: "private" });
  });

  it.each(["always", "never"] as const)("a committed TUI %s remains saved after later cancellation", async outcome => {
    const { controller, answer, pending } = tui();
    expect(await decide(pending, outcome)).toBe(true);
    controller.abort();
    expect(await answer).toBe(outcome === "always");
    expect(matchRule(await loadRules(), "browser_read", "read public page", root)).toBe(outcome === "always" ? "allow" : "deny");
  });

  it.each(["always", "never"] as const)("a committed Desktop %s remains saved after later cancellation", async outcome => {
    const controller = new AbortController();
    const host: { root: string; pendingApproval?: PendingApproval } = { root };
    const answer = requestWebApproval(host, "read public page", "fixture", { toolName: "browser_read", detail: { signal: controller.signal } });
    await resolveApproval(host.pendingApproval!, outcome);
    controller.abort();
    expect(await answer).toBe(outcome === "always");
    expect(matchRule(await loadRules(), "browser_read", "read public page", root)).toBe(outcome === "always" ? "allow" : "deny");
  });

  it("a late HTTP decision cannot claim a newer prompt created in the same millisecond", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    const host: { root: string; pendingApproval?: PendingApproval } = { root }, first = new AbortController();
    const answer = requestWebApproval(host, "old", "fixture", { detail: { signal: first.signal } });
    const old = host.pendingApproval!; first.abort(); expect(await answer).toBe(false);
    const next = requestWebApproval(host, "new", "fixture"), current = host.pendingApproval!;
    const req = Readable.from([JSON.stringify({ id: old.id, decision: "allow" })]) as unknown as http.IncomingMessage;
    req.method = "POST"; let status = 0;
    const res = { writeHead(code: number) { status = code; }, end() {} } as unknown as http.ServerResponse;
    try {
      await handleApproval(host, req, res);
      expect(status).toBe(404); expect(host.pendingApproval).toBe(current); expect(current.isActive!()).toBe(true);
    } finally { current.resolve(false); await next; }
  });

  it("worker cancellation reaches a claimed Desktop choice while its rule is saving", async () => {
    const controller = new AbortController();
    const host: { root: string; pendingApproval?: PendingApproval } = { root };
    const gate = createDesktopLaunchGate(host, { kernel: { assess: async () => ({ risk: "ask" }) } });
    const answer = gate.authorize({ runtimeId: "fixture", displayName: "Fixture", command: "fixture", cwd: root,
      ticketId: "test", runId: "test", prompt: "read fixture", access: "read-only", selfApproving: false, signal: controller.signal });
    await vi.waitFor(() => expect(host.pendingApproval).toBeDefined());
    const pending = host.pendingApproval!, pause = pauseWrite(); host.pendingApproval = undefined;
    const operation = resolveApproval(pending, "always").catch(error => error);
    try { await pause.written; controller.abort(); } finally { pause.release(); }
    await operation; expect(await answer).toMatchObject({ ok: false });
    expect(await readFile(join(home, "permissions.tsv"), "utf8")).toBe(original);
    expect(matchRule(await loadRules(), "call_agent", pending.action, root)).toBeNull();
  });

  it.each(["TUI", "Desktop"] as const)("%s outer-kernel Ask keeps the actual turn lifetime through saving", async hostType => {
    const controller = new AbortController(), registry = new InMemoryToolRegistry(), execute = vi.fn(async () => ({ ok: true, output: "read" }));
    registry.register({ schema: { name: "browser_read", description: "fixture", parameters: { type: "object", properties: {} } }, describeForSafety: () => "read public page", execute });
    const host: { root: string; pendingApproval?: PendingApproval } = { root };
    const taskApprovals = new TaskApprovalScope(); let pending: Pending | null = null;
    const requestApproval: AgentDeps["requestApproval"] = (action, reason, toolName, detail) => hostType === "Desktop"
      ? requestWebApproval(host, action, reason, { toolName, detail })
      : requestApprovalWithTaskScope({ root, action, reason, toolName, detail, taskApprovals, setPending: value => { pending = typeof value === "function" ? value(pending) : value; } });
    const safety = { assess: async () => ({ risk: "ask", needsHuman: true, reason: "fixture" }), proposeApproval: async () => "fixture", approve: async () => {}, deny: async () => {}, logEvent: async () => {} } as unknown as AgentDeps["safety"];
    const provider: AgentDeps["provider"] = { modelId: () => "fixture", contextWindow: () => 100_000,
      complete: async () => ({ text: "", toolCalls: [{ id: "read", name: "browser_read", arguments: {} }], finishReason: "tool_calls" }) };
    const turn = runTurn({ messages: [{ role: "system", content: "fixture" }], userText: "read public page", signal: controller.signal,
      ctx: { root, safety, requestApproval }, deps: { root, safety, registry, provider, requestApproval, maxIterations: 1 } });
    await vi.waitFor(() => expect(hostType === "Desktop" ? host.pendingApproval : pending).toBeTruthy());
    const pause = pauseWrite();
    const decision = (hostType === "Desktop" ? resolveApproval(host.pendingApproval!, "always") : decide(pending!, "always")).catch(error => error);
    try { await pause.written; controller.abort(); } finally { pause.release(); }
    await decision; await turn;
    expect(await readFile(join(home, "permissions.tsv"), "utf8")).toBe(original);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(["TUI", "Desktop"] as const)("%s cancellation immediately after publication retains the committed preference", async hostType => {
    const controller = new AbortController(), host: { root: string; pendingApproval?: PendingApproval } = { root };
    const terminal = hostType === "TUI" ? tui() : undefined;
    const activeController = terminal?.controller ?? controller;
    const answer = terminal?.answer ?? requestWebApproval(host, "read public page", "fixture", { toolName: "browser_read", detail: { signal: controller.signal } });
    io.afterPublish = () => activeController.abort();
    await (terminal ? decide(terminal.pending, "always") : resolveApproval(host.pendingApproval!, "always")).catch(() => undefined);
    expect(await answer).toBe(false);
    expect(matchRule(await loadRules(), "browser_read", "read public page", root)).toBe("allow");
    expect((await readdir(home)).filter(file => file.startsWith("permissions.tsv."))).toEqual([]);
  });
});
