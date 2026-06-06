import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildInitializeResult,
  buildToolDef,
  handleMessage,
  resolveServeAllowlist,
  runMcpServer,
  type ServerDeps,
  type ServerTransport,
} from "./server.js";
import { McpClient, type Transport } from "./client.js";
import { buildRegistry } from "../tools/index.js";
import type { SafetyClient } from "../safety-client.js";
import type { Verdict } from "../types.js";
import type { ToolContext } from "../tools/types.js";

/** A SafetyClient stub that returns a fixed verdict for assess(). */
function fakeSafety(risk: Verdict["risk"], reason = "test"): SafetyClient {
  return {
    assess: async (): Promise<Verdict> => ({ risk, needsHuman: risk === "ask", reason }),
  } as unknown as SafetyClient;
}

function deps(overrides: Partial<ServerDeps> = {}): ServerDeps {
  const safety = overrides.safety ?? fakeSafety("allow");
  return {
    registry: overrides.registry ?? buildRegistry(),
    safety,
    allowlist: overrides.allowlist ?? resolveServeAllowlist({} as NodeJS.ProcessEnv),
    ctx: overrides.ctx ?? ({ root: "/tmp", safety, requestApproval: async () => false } as ToolContext),
  };
}

describe("resolveServeAllowlist", () => {
  it("defaults to a read-only safe set", () => {
    const set = resolveServeAllowlist({} as NodeJS.ProcessEnv);
    expect(set.has("read_file")).toBe(true);
    expect(set.has("write_file")).toBe(false);
    expect(set.has("shell_cmd")).toBe(false);
  });

  it("is overridable via VANTA_MCP_SERVE_TOOLS", () => {
    const set = resolveServeAllowlist({ VANTA_MCP_SERVE_TOOLS: "read_file, web_search" } as NodeJS.ProcessEnv);
    expect(set.has("read_file")).toBe(true);
    expect(set.has("web_search")).toBe(true);
    expect(set.has("inspect_state")).toBe(false);
  });
});

describe("buildInitializeResult", () => {
  it("matches the MCP 2024-11-05 handshake shape", () => {
    const r = buildInitializeResult();
    expect(r.protocolVersion).toBe("2024-11-05");
    expect(r.capabilities).toEqual({ tools: {} });
    expect(r.serverInfo).toEqual({ name: "argo", version: "0.1.0" });
  });
});

describe("buildToolDef", () => {
  it("maps an Argo tool to the MCP tool-def shape", () => {
    const tool = buildRegistry().get("read_file")!;
    const def = buildToolDef(tool);
    expect(def.name).toBe("read_file");
    expect(typeof def.description).toBe("string");
    expect(def.inputSchema).toHaveProperty("type");
  });
});

describe("handleMessage", () => {
  it("answers initialize with the handshake result", async () => {
    const res = (await handleMessage({ id: 1, method: "initialize" }, deps())) as {
      result: { protocolVersion: string };
    };
    expect(res.result.protocolVersion).toBe("2024-11-05");
  });

  it("returns null for a notification (no id)", async () => {
    const res = await handleMessage({ method: "notifications/initialized" }, deps());
    expect(res).toBeNull();
  });

  it("lists only allowlisted tools", async () => {
    const res = (await handleMessage({ id: 2, method: "tools/list" }, deps())) as {
      result: { tools: Array<{ name: string }> };
    };
    const names = res.result.tools.map((t) => t.name);
    expect(names).toContain("read_file");
    expect(names).not.toContain("write_file");
    expect(names).not.toContain("shell_cmd");
  });

  it("returns a JSON-RPC error for an unknown method", async () => {
    const res = (await handleMessage({ id: 3, method: "bogus/method" }, deps())) as {
      error: { code: number };
    };
    expect(res.error.code).toBe(-32601);
  });

  it("returns a JSON-RPC error when tools/call has no name", async () => {
    const res = (await handleMessage({ id: 4, method: "tools/call", params: {} }, deps())) as {
      error: { code: number };
    };
    expect(res.error.code).toBe(-32602);
  });

  it("refuses a non-allowlisted tool with isError (not a transport error)", async () => {
    const res = (await handleMessage(
      { id: 5, method: "tools/call", params: { name: "shell_cmd", arguments: {} } },
      deps(),
    )) as { result: { isError: boolean; content: Array<{ text: string }> } };
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0]!.text).toContain("not exposed");
  });

  it("refuses a kernel-blocked call with isError + the reason", async () => {
    const res = (await handleMessage(
      { id: 6, method: "tools/call", params: { name: "read_file", arguments: { path: "x" } } },
      deps({ safety: fakeSafety("block", "destructive") }),
    )) as { result: { isError: boolean; content: Array<{ text: string }> } };
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0]!.text).toContain("blocked by safety");
    expect(res.result.content[0]!.text).toContain("destructive");
  });

  it("refuses an ask verdict (headless — no human to prompt)", async () => {
    const res = (await handleMessage(
      { id: 7, method: "tools/call", params: { name: "read_file", arguments: { path: "x" } } },
      deps({ safety: fakeSafety("ask", "outside scope") }),
    )) as { result: { isError: boolean; content: Array<{ text: string }> } };
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0]!.text).toContain("requires human approval");
  });
});

/** Two transports wired directly together — client.send → server.onMessage and back. */
function linkedTransports(): { clientT: Transport; serverT: ServerTransport } {
  let clientOnMsg: ((line: string) => void) | undefined;
  let serverOnMsg: ((line: string) => void) | undefined;
  const clientT: Transport = {
    send: (line) => queueMicrotask(() => serverOnMsg?.(line)),
    onMessage: (cb) => (clientOnMsg = cb),
    onError: () => {},
    close: () => {},
  };
  const serverT: ServerTransport = {
    send: (line) => queueMicrotask(() => clientOnMsg?.(line)),
    onMessage: (cb) => (serverOnMsg = cb),
    onClose: () => {},
  };
  return { clientT, serverT };
}

describe("reciprocal: real McpClient drives the server through the kernel gate", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "argo-serve-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("allow verdict → read_file executes end-to-end via tools/list + tools/call", async () => {
    await writeFile(join(root, "hello.txt"), "from argo serve", "utf8");
    const safety = fakeSafety("allow");
    const { clientT, serverT } = linkedTransports();
    const serverDeps = deps({
      safety,
      ctx: { root, safety, requestApproval: async () => false } as ToolContext,
    });
    void runMcpServer(serverT, serverDeps);

    const client = new McpClient(clientT);
    await client.initialize();
    const tools = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("read_file");

    const out = await client.callTool("read_file", { path: "hello.txt" });
    expect(out).toContain("from argo serve");
  });

  it("block verdict → the gate refusal is surfaced to the client", async () => {
    const safety = fakeSafety("block", "destructive keyword");
    const { clientT, serverT } = linkedTransports();
    void runMcpServer(
      serverT,
      deps({ safety, ctx: { root, safety, requestApproval: async () => false } as ToolContext }),
    );
    const client = new McpClient(clientT);
    await client.initialize();
    const out = await client.callTool("read_file", { path: "anything" });
    expect(out).toContain("blocked by safety");
    expect(out).toContain("destructive keyword");
  });
});
