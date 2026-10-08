import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { createDesktopServer } from "./server.js";
import type { DesktopState } from "./handler-state.js";
import type { RunSetup } from "../session.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import { saveProviderAuthRequired } from "./provider-auth-store.js";
import { recordCapabilityProviderResult } from "../agent/capability-snapshot.js";
import { whatCanIDo } from "../repl/what-can-i-do-cmd.js";
import type { ReplCtx } from "../repl/types.js";

let root: string;
let server: Server;
let url: string;
let state: DesktopState;
const registered = ["read_file", "grep_files", "edit_file", "shell_cmd", "write_file"];

function fixtureState(): DesktopState {
  const registry = new InMemoryToolRegistry();
  for (const name of registered) registry.register({ schema: { name, description: `${name} fixture`, parameters: {} }, execute: async () => ({ ok: true, output: "fixture" }) });
  const provider = { modelId: () => "fixture", complete: vi.fn(), contextWindow: () => 32_000 };
  return { root, sessionId: "fixture", accessMode: "ask", setup: {
    registry, provider, safety: { logEvent: async () => {} }, goals: [], systemPrompt: "Fixture instructions",
  } as unknown as RunSetup };
}

async function request(path: string, mode?: string): Promise<unknown> {
  const response = await fetch(`${url}${path}`, { headers: { "X-Session-Id": "fixture", "content-type": "application/json" },
    ...(mode ? { method: "POST", body: JSON.stringify({ mode }) } : {}) });
  expect(response.status).toBe(200);
  return response.json();
}

async function capabilityNames(): Promise<string[]> {
  const rows = await request("/api/capabilities") as { kind: string; name: string; tags: string[] }[];
  expect(rows.filter((row) => row.kind === "tool").every((row) => row.tags.includes("Setup checked when used"))).toBe(true);
  return rows.filter((row) => row.kind === "tool").map((row) => row.name).sort();
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-capability-http-"));
  vi.stubEnv("VANTA_HOME", join(root, "isolated-home"));
  vi.stubEnv("VANTA_OPERATING_MODE", "default");
  vi.stubEnv("VANTA_PERMISSION_MODE", "default");
  state = fixtureState();
  server = createDesktopServer(root, { sessions: new Map([["fixture", state]]), boundaryToken: "" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

describe("capability catalog through real Desktop HTTP and slash routes", () => {
  it("refreshes manual/accept-edits/auto/full/plan using actual access-mode POSTs", async () => {
    vi.stubEnv("VANTA_OPERATING_MODE", "plan");
    for (const mode of ["ask", "approve", "auto", "full", "plan"]) {
      await request("/api/access-mode", mode);
      const expected = mode === "plan" ? ["read_file", "grep_files", "edit_file"] : registered;
      expect(await capabilityNames()).toEqual([...expected].sort());
      const gallery = await whatCanIDo("", { setup: state.setup, convo: state.convo, state: { planApproved: false } } as ReplCtx);
      expect(gallery.output).toContain(`Callable tool routes: ${expected.join(", ")}.`);
    }
    expect(state.setup!.provider.complete).not.toHaveBeenCalled();
  });

  it("does not list routes after an observed provider auth/offline failure, and recovers after success", async () => {
    for (const error of [new Error("401 invalid API key"), new Error("ECONNREFUSED"), new Error("billing quota exceeded")]) {
      recordCapabilityProviderResult(state.setup!.provider, error);
      expect(await capabilityNames()).toEqual([]);
      const gallery = await whatCanIDo("", { setup: state.setup, convo: state.convo, state: {} } as ReplCtx);
      expect(gallery.output).toContain("Run 0 · Try 0 · Setup 8");
      expect(gallery.output).toContain("Callable tool routes: none.");
    }
    recordCapabilityProviderResult(state.setup!.provider);
    expect(await capabilityNames()).toEqual([...registered].sort());
  });

  it("reads persisted auth-required state without relying on a preceding status request", async () => {
    await saveProviderAuthRequired(root, { provider: "fixture", model: "fixture", baseRoute: "provider://fixture", billingMode: "unknown", authMethod: "unknown" });
    expect(await capabilityNames()).toEqual([]);
  });
});
