import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fireHooks, firePreToolUse, loadShellHooks, shellHooksPath } from "./shell-hooks.js";
import type { CompletionResult, LLMProvider } from "../providers/interface.js";

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
      runAgentHook: async () => ({ code: 1, stdout: '{"decision":"block"}', stderr: "agent veto" }),
    });
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe("agent veto");
  });

  it("respects per-hook timeoutMs", async () => {
    await writeHooks({ PreToolUse: [{ command: "sleep 1", timeoutMs: 1 }] });
    const r = await firePreToolUse(dir, "write_file", {});
    expect(r.blocked).toBe(true);
    expect(r.reason).toContain("timed out");
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
        await fireHooks(dir, "PostToolUse", { tool: "read_file" }, { env: { HOOK_TOKEN: "secret" } as NodeJS.ProcessEnv });
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
