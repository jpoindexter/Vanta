import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fireHooks, firePreToolUse, fireStopHook, loadShellHooks, shellHooksPath } from "./shell-hooks.js";
import type { CompletionResult, LLMProvider } from "../providers/interface.js";

// Temp 'project' dirs carry no trust decision; opt past the project-trust gate.
process.env.VANTA_ENABLE_PROJECT_HOOKS = "1";

let dir: string;

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "vanta-hook-types-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

async function writeHooks(config: unknown): Promise<void> {
  await writeFile(shellHooksPath(dir), JSON.stringify(config), "utf8");
}

describe("hook type parity", () => {
  it("parses http, prompt, and agent hooks with shared controls", async () => {
    await writeHooks({
      PreToolUse: [
        { type: "http", url: "http://127.0.0.1:9999/hook", timeoutMs: 50, once: true, statusMessage: "checking" },
        { type: "prompt", prompt: "Judge this hook event." },
        { type: "agent", prompt: "Investigate this hook event.", maxIterations: 2 },
      ],
    });
    const c = await loadShellHooks(dir);
    expect(c.PreToolUse?.map((h) => h.type)).toEqual(["http", "prompt", "agent"]);
    expect(c.PreToolUse?.[0]?.statusMessage).toBe("checking");
  });

  it("blocks from a prompt hook JSON verdict", async () => {
    await writeHooks({ PreToolUse: [{ type: "prompt", prompt: "Return allow or block." }] });
    const r = await firePreToolUse(dir, "write_file", { path: "x" }, { promptProvider: fakeProvider('{"decision":"block","reason":"no writes now"}') });
    expect(r.blocked).toBe(true);
    expect(r.reason).toContain("no writes now");
  });

  it("blocks from an agent hook result", async () => {
    await writeHooks({ PreToolUse: [{ type: "agent", prompt: "Inspect with tools.", maxIterations: 2 }] });
    const r = await firePreToolUse(dir, "shell_cmd", { cmd: "npm test" }, {
      // A block verdict is the canonical block exit code (2); stderr → model reason.
      runAgentHook: async () => ({ code: 2, stdout: '{"decision":"block"}', stderr: "agent veto" }),
    });
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe("agent veto");
  });

  it("runs agent hooks for user prompt events", async () => {
    const seen: string[] = [];
    await writeHooks({ UserPromptSubmit: [{ type: "agent", prompt: "Inspect prompt." }] });
    await fireHooks(dir, "UserPromptSubmit", { prompt: "hello" }, {
      runAgentHook: async (_hook, contextJson) => {
        seen.push(contextJson);
        return { code: 0, stdout: '{"decision":"allow","reason":"ok"}', stderr: "" };
      },
    });
    expect(JSON.parse(seen[0] ?? "{}")).toMatchObject({ event: "UserPromptSubmit", prompt: "hello" });
  });

  it("runs agent hooks for stop events and reads additional context", async () => {
    await writeHooks({ Stop: [{ type: "agent", prompt: "Summarize stop context." }] });
    const context = await fireStopHook(dir, { sessionId: "s1" }, {
      runAgentHook: async (_hook, contextJson) => ({
        code: 0,
        stdout: JSON.stringify({ additionalContext: `saw ${JSON.parse(contextJson).sessionId}` }),
        stderr: "",
      }),
    });
    expect(context).toBe("saw s1");
  });

  it("respects per-hook timeoutMs (timeout exit 124 is non-blocking, surfaced to the user)", async () => {
    await writeHooks({ PreToolUse: [{ command: "sleep 1", timeoutMs: 1 }] });
    const r = await firePreToolUse(dir, "write_file", {});
    // Exit 124 (timeout) is "other non-zero" per hook-exit-codes: non-blocking, stderr → user.
    expect(r.blocked).toBe(false);
    expect(r.userMessage).toContain("timed out");
  });

  it("POSTs http hooks with allowed env and expanded headers", async () => {
    const received = new Promise<{ body: string; auth: string | undefined }>((resolve) => {
      const server = createServer((req, res) => {
        void requestBody(req).then((body) => {
          resolve({ body, auth: req.headers.authorization });
          res.end("ok");
          server.close();
        });
      });
      server.listen(0, "127.0.0.1", async () => {
        const port = (server.address() as AddressInfo).port;
        await writeHooks({ PostToolUse: [{ type: "http", url: `http://127.0.0.1:${port}/hook`, headers: { authorization: "Bearer $HOOK_TOKEN" }, allowedEnvVars: ["HOOK_TOKEN"] }] });
        // Loopback test server = the trusted self-hosted-hook case → opt out of the SSRF guard.
        await fireHooks(dir, "PostToolUse", { tool: "read_file" }, { env: { HOOK_TOKEN: "secret", VANTA_HOOK_ALLOW_PRIVATE: "1" } as NodeJS.ProcessEnv });
      });
    });
    const got = await received;
    expect(got.auth).toBe("Bearer secret");
    expect(JSON.parse(got.body)).toMatchObject({ tool: "read_file", env: { HOOK_TOKEN: "secret" } });
  });

  it("runs a once hook only once and emits statusMessage", async () => {
    const marker = join(dir, "once");
    const statuses: string[] = [];
    await writeHooks({ PostToolUse: [{ command: `printf x >> ${marker}`, once: true, statusMessage: "running once" }] });
    await fireHooks(dir, "PostToolUse", { tool: "read_file" }, { onStatus: (m) => statuses.push(m) });
    await fireHooks(dir, "PostToolUse", { tool: "read_file" }, { onStatus: (m) => statuses.push(m) });
    await expect(access(marker)).resolves.toBeUndefined();
    expect(await readFile(marker, "utf8")).toBe("x");
    expect(statuses).toEqual(["running once"]);
  });
});

function fakeProvider(text: string): LLMProvider {
  const result: CompletionResult = { text, toolCalls: [], finishReason: "stop" };
  return { complete: async () => result, modelId: () => "fake-hook-model", contextWindow: () => 8_000 };
}

function requestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => resolve(body));
  });
}
