import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSpawnDepth } from "./spawn-guard.js";
import { spawnSubagent } from "./spawn.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import { prepareProfileKernelState, profileKernelState } from "../kernel/profile-state.js";
import type { AgentDeps } from "../agent.js";

let base: string, root: string;
beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "vanta-spawn-auth-")));
  root = join(base, "project");
  mkdirSync(join(root, ".vanta"), { recursive: true });
  writeFileSync(join(root, ".vanta/api-token"), "fixture-project-token");
  mkdirSync(join(base, "home"));
  vi.stubEnv("VANTA_ROOT", root);
  vi.stubEnv("VANTA_HOME", join(base, "home"));
  vi.stubEnv("VANTA_PROFILE", "default");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(base, { recursive: true, force: true }); });

const allow = { allowed: true, reason: "fixture allowed", depth: 1, max_depth: 6 };
const options = (fetchImpl: typeof fetch) => ({ root, parent: "parent", child: "worker", depth: 1, fetchImpl });
const makeDeps = (complete: AgentDeps["provider"]["complete"]): AgentDeps => ({
  root, registry: new InMemoryToolRegistry(), requestApproval: async () => false,
  provider: { complete, modelId: () => "fixture", contextWindow: () => 8192 },
  safety: { status: async () => true, assess: async () => ({ risk: "allow", needsHuman: false, reason: "fixture" }),
    logEvent: async () => {}, getGoals: async () => [], addGoal: async () => false, completeGoal: async () => false,
    getApprovals: async () => [], proposeApproval: async () => null, approve: async () => {}, deny: async () => {} },
});

it("refuses missing default authority before a successful-looking response or provider can run", async () => {
  unlinkSync(join(root, ".vanta/api-token"));
  const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(allow));
  vi.stubGlobal("fetch", fetchImpl);
  const complete = vi.fn(async () => ({ text: "Unexpected worker", toolCalls: [], finishReason: "stop" as const }));
  const verdict = await checkSpawnDepth(options(fetchImpl));
  const outcome = await spawnSubagent({ goal: "fixture", instruction: "fixture", deps: makeDeps(complete) });
  expect(verdict.allowed).toBe(false);
  expect(outcome.iterations).toBe(0);
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
});

describe("spawn kernel authentication", () => {
  it("uses the explicit project root rather than a nearer environment token", async () => {
    const nested = join(root, "nested");
    mkdirSync(join(nested, ".vanta"), { recursive: true });
    writeFileSync(join(nested, ".vanta/api-token"), "wrong-nearer-token");
    vi.stubEnv("VANTA_ROOT", nested);
    let authorization: string | null = null, signal: AbortSignal | null | undefined;
    const fetchImpl: typeof fetch = async (_url, init) => {
      authorization = new Headers(init?.headers).get("authorization");
      signal = init?.signal;
      return Response.json(allow);
    };
    expect((await checkSpawnDepth(options(fetchImpl))).allowed).toBe(true);
    expect(authorization).toBe("Bearer fixture-project-token");
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("uses private named-profile authority for the exact project", async () => {
    const home = join(base, "profiles/writer");
    mkdirSync(home, { recursive: true });
    vi.stubEnv("VANTA_PROFILE", "writer");
    vi.stubEnv("VANTA_PROFILE_BASE_HOME", base);
    vi.stubEnv("VANTA_HOME", home);
    const state = profileKernelState(root)!;
    prepareProfileKernelState(state);
    writeFileSync(join(state.directory, "api-token"), "fixture-profile-token");
    let authorization: string | null = null;
    const fetchImpl: typeof fetch = async (_url, init) => {
      authorization = new Headers(init?.headers).get("authorization");
      return Response.json(allow);
    };
    expect((await checkSpawnDepth(options(fetchImpl))).allowed).toBe(true);
    expect(authorization).toBe("Bearer fixture-profile-token");
  });

  it("refuses a profile with missing authority without trying project authority", async () => {
    const home = join(base, "profiles/writer");
    mkdirSync(home, { recursive: true });
    vi.stubEnv("VANTA_PROFILE", "writer");
    vi.stubEnv("VANTA_PROFILE_BASE_HOME", base);
    vi.stubEnv("VANTA_HOME", home);
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(allow));
    expect((await checkSpawnDepth(options(fetchImpl))).allowed).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("unverified spawn checks fail closed", () => {
  it.each([401, 403, 500])("rejects HTTP %s even with an allow-shaped body", async status => {
    const verdict = await checkSpawnDepth(options(async () => Response.json(allow, { status })));
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).not.toContain("fixture-project-token");
  });

  it.each([401, 403, 500, "malformed", "unreachable", "timeout"])("refuses %s without starting a provider", async failure => {
    const fetchImpl: typeof fetch = async () => {
      if (typeof failure === "number") return Response.json(allow, { status: failure });
      if (failure === "malformed") return Response.json({ not: "a verdict" });
      throw new DOMException("private fixture failure", failure === "timeout" ? "TimeoutError" : "NetworkError");
    };
    vi.stubGlobal("fetch", fetchImpl);
    const complete = vi.fn(async () => ({ text: "Unexpected worker", toolCalls: [], finishReason: "stop" as const }));
    const outcome = await spawnSubagent({ goal: "private test", instruction: "No worker should start", deps: makeDeps(complete) });
    expect(outcome.iterations).toBe(0);
    expect(outcome.finalText).toContain("Spawn refused by kernel");
    expect(complete).not.toHaveBeenCalled();
  });

  it("passes the actual worker project root into its spawn guard", async () => {
    const complete = vi.fn();
    const checkSpawn = vi.fn(async () => ({ allowed: false, reason: "fixture denied", depth: 1, maxDepth: 6 }));
    await spawnSubagent({ goal: "private test", instruction: "Do not start", deps: makeDeps(complete), checkSpawn });
    expect(checkSpawn).toHaveBeenCalledWith(expect.objectContaining({ root }));
    expect(complete).not.toHaveBeenCalled();
  });
});

it("uses explicit parent kernel identity for a separate worker root and still rejects 401", async () => {
  const workerRoot = join(base, "separate-worker");
  mkdirSync(workerRoot);
  let authorization: string | null = null;
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    authorization = new Headers(init.headers).get("authorization");
    return Response.json(allow, { status: 401 });
  });
  const complete = vi.fn();
  const outcome = await spawnSubagent({ goal: "fixture", instruction: "fixture", kernelRoot: root,
    deps: { ...makeDeps(complete), root: workerRoot } });
  expect(authorization).toBe("Bearer fixture-project-token");
  expect(outcome.iterations).toBe(0);
  expect(complete).not.toHaveBeenCalled();
});
