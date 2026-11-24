import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentDeps } from "../agent.js";
import type { DesktopState } from "./handler-state.js";
import { freshState, headers, openSse, startServer, type SseProbe, type TestServer } from "./__fixtures__/sse-harness.js";

// A real desktop server with only the model and the conversation faked: the chat, receipt, saved auth-required
// state, typed events and the real /api/setup route are production code. A 401 from the provider must stop the
// turn as provider_auth, keep the request, and a reconnect (setup) must let the same request run again.

type Message = { role: string; content: string; desktopRun?: { failureKind?: string } };
type Outcome = { finalText: string; iterations: number; stoppedReason: string; toolIterations: number };
const hoisted = vi.hoisted(() => ({
  send: undefined as undefined | ((text: string) => Promise<unknown>),
  built: [] as Array<{ history: Message[] }>,
  prepared: 0,
}));

vi.mock("../agent.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../agent.js")>()),
  createConversation: (_system: string, _deps: AgentDeps, opts?: { history?: Message[] }) => {
    // Like the real createConversation: a history never carries its own system message.
    const history = (opts?.history ?? []).filter((m) => m.role !== "system");
    const messages: Message[] = [{ role: "system", content: "" }, ...history];
    hoisted.built.push({ history });
    return {
      messages,
      send: async (text: string) => {
        messages.push({ role: "user", content: text });
        const outcome = await hoisted.send!(text) as Outcome;
        messages.push({ role: "assistant", content: outcome.finalText });
        return outcome;
      },
      setProvider: () => undefined, setSessionMemory: () => undefined,
    };
  },
}));

vi.mock("../session.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../session.js")>()),
  prepareRun: async () => {
    hoisted.prepared += 1;
    return { provider: { modelId: () => "fake", contextWindow: () => 200_000 }, goals: [], registry: { list: () => [] }, safety: { getGoals: async () => [], logEvent: async () => undefined }, systemPrompt: "" };
  },
}));

const ENV_KEYS = ["VANTA_HOME", "VANTA_PROVIDER", "VANTA_MODEL"];
const saved = new Map<string, string | undefined>();
let home: string; let root: string; let server: TestServer; let sessions: Map<string, DesktopState>; const probes: SseProbe[] = [];

beforeEach(async () => {
  for (const key of ENV_KEYS) saved.set(key, process.env[key]);
  home = await mkdtemp(join(tmpdir(), "vanta-auth-home-")); root = await mkdtemp(join(tmpdir(), "vanta-auth-root-"));
  process.env.VANTA_HOME = home;
  hoisted.built.length = 0; hoisted.prepared = 0;
  sessions = new Map([["a", freshState("a", root)], ["b", freshState("b", root)]]);
  server = await startServer(root, sessions);
});
afterEach(async () => {
  probes.splice(0).forEach((probe) => probe.close());
  await server.close();
  for (const [key, value] of saved) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  await Promise.all([rm(home, { recursive: true, force: true }), rm(root, { recursive: true, force: true })]);
});

const ok = (finalText: string): Outcome => ({ finalText, iterations: 1, stoppedReason: "done", toolIterations: 0 });
const post = (id: string, path: string, body: unknown) => fetch(`http://127.0.0.1:${server.port}${path}`, { method: "POST", headers: headers(id), body: JSON.stringify(body) });
const chat = async (id: string, message: string) => { const r = await post(id, "/api/chat", { message }); return { status: r.status, body: await r.json() as Record<string, any> }; };
const expired = () => { throw new Error("401 Incorrect API key provided"); };

describe("provider auth failure, reconnect and resume", () => {
  it("stops as provider_auth, keeps the request, and runs it again after a reconnect from another chat", async () => {
    hoisted.send = async () => ok("first answer");
    expect((await chat("a", "first question")).body.finalText).toBe("first answer");

    const sse = await openSse(server.port, "a"); probes.push(sse);
    hoisted.send = async () => expired();
    const failed = await chat("a", "summarize the brief");
    expect(failed.status).toBe(200);
    expect(failed.body.receipt).toMatchObject({ status: "failed", failureKind: "provider_auth", actions: ["edit_request", "start_from_checkpoint"] });
    expect(failed.body.finalText).toContain("Provider authentication required");
    const typed = await sse.waitFor((frame) => frame.typed?.type === "turn.complete");
    expect(typed.typed).toMatchObject({ stoppedReason: "provider_auth" });
    await expect(access(join(root, ".vanta", "provider-auth-required.json"))).resolves.toBeUndefined();

    // While the key is still refused, a retry is answered from the saved state without calling the model.
    const calls: string[] = [];
    hoisted.send = async (text) => { calls.push(text); return ok("never"); };
    const blocked = await chat("a", "summarize the brief");
    expect(blocked.body.receipt.failureKind).toBe("provider_auth");
    expect(calls).toEqual([]);

    // Reconnect through a DIFFERENT chat (a Settings page open in another chat).
    process.env.VANTA_PROVIDER = "openai";
    const setup = await post("b", "/api/setup", { provider: "ollama", model: "llama3.3" });
    expect(setup.status).toBe(200);
    await expect(access(join(root, ".vanta", "provider-auth-required.json"))).rejects.toThrow();
    expect(await readFile(join(root, ".vanta", ".env"), "utf8")).toContain("VANTA_PROVIDER=ollama");

    // The same request now runs on chat "a", on a fresh provider, with the earlier answer still in its history
    // and the stopped request not duplicated in it.
    hoisted.send = async (text) => { calls.push(text); return ok("the summary"); };
    const resumed = await chat("a", "summarize the brief");
    expect(resumed.body).toMatchObject({ finalText: "the summary", receipt: { status: "done" } });
    expect(calls).toEqual(["summarize the brief"]);
    expect(hoisted.prepared).toBeGreaterThan(0);
    expect(hoisted.built.at(-1)?.history.map((m) => [m.role, m.content])).toEqual([
      ["user", "first question"],
      ["assistant", "first answer"],
    ]);
  });

  it("does not disturb a chat whose turn is running when the setup lands", async () => {
    let release: undefined | (() => void);
    hoisted.send = () => new Promise((resolve) => { release = () => resolve(ok("long turn")); });
    const running = chat("a", "slow work");
    for (let i = 0; i < 300 && !release; i += 1) await new Promise((r) => setTimeout(r, 10));
    expect(release).toBeDefined();
    expect(sessions.get("a")?._chatActive).toBe(true);

    expect((await post("a", "/api/setup", { provider: "ollama", model: "llama3.3" })).status).toBe(200);
    expect(sessions.get("a")?.convo).toBeDefined();
    release?.();
    expect((await running).body.finalText).toBe("long turn");
  });
});
