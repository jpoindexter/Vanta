import { describe, expect, it } from "vitest";
import { createRuntimeControllerAdapter } from "./adapter.js";
import type { RuntimeControllerTransport, RuntimeHostConfig, RuntimeObservation } from "./types.js";

const now = Date.parse("2026-07-17T12:00:00.000Z");
const hosts: RuntimeHostConfig[] = [
  { id: "local", label: "Local Mac", kind: "local", endpoint: "http://127.0.0.1:11434", authRequired: false },
  { id: "remote", label: "Remote GPU", kind: "remote", endpoint: "https://runtime.example.test", authRequired: false },
  { id: "locked", label: "Locked Host", kind: "remote", endpoint: "https://locked.example.test", authRequired: true, credentialRef: "runtime-token" },
  { id: "down", label: "Offline Host", kind: "remote", endpoint: "https://down.example.test", authRequired: false },
];

function observation(overrides: Partial<RuntimeObservation> = {}): RuntimeObservation {
  return {
    observedAt: "2026-07-17T12:00:00.000Z", epoch: "boot-a", sequence: 1,
    transport: "reachable", kernel: "ready", engine: { id: "ollama", lifecycle: "running", model: "qwen" },
    resources: { memoryUsedBytes: 4, memoryTotalBytes: 8, utilizationPercent: 50, throughputPerSecond: 10 }, queueDepth: 2,
    ...overrides,
  };
}

function transport(inspect: RuntimeControllerTransport["inspect"]): RuntimeControllerTransport {
  return { inspect, stream: async function* () { yield observation(); } };
}

describe("runtime controller contract", () => {
  it("discovers configured local and remote hosts without equating reachability with kernel trust", async () => {
    const adapter = createRuntimeControllerAdapter({
      hosts,
      now: () => now,
      resolveCredential: async () => undefined,
      transport: transport(async (host) => {
        if (host.id === "down") throw new Error("secret upstream error");
        if (host.id === "remote") return observation({ kernel: "not_ready", engine: { id: "vllm", lifecycle: "idle" } });
        return observation();
      }),
    });
    const snapshots = await adapter.discover();
    expect(snapshots.map((snapshot) => snapshot.host.id)).toEqual(["local", "remote", "locked", "down"]);
    expect(snapshots.find((snapshot) => snapshot.host.id === "local")).toMatchObject({ status: "running", transport: "reachable", kernel: "ready", queueDepth: 2 });
    expect(snapshots.find((snapshot) => snapshot.host.id === "remote")).toMatchObject({ status: "degraded", transport: "reachable", kernel: "not_ready" });
    expect(snapshots.find((snapshot) => snapshot.host.id === "locked")).toMatchObject({ status: "auth_required", transport: "auth_required", kernel: "unknown" });
    expect(snapshots.find((snapshot) => snapshot.host.id === "down")).toMatchObject({ status: "offline", transport: "offline", kernel: "unknown" });
    expect(JSON.stringify(snapshots)).not.toMatch(/endpoint|token|secret upstream/i);
  });

  it.each(["idle", "starting", "running", "stopping", "failed"] as const)("preserves the %s lifecycle when transport and kernel are ready", async (lifecycle) => {
    const adapter = createRuntimeControllerAdapter({ hosts: [hosts[0]!], now: () => now, transport: transport(async () => observation({ engine: { lifecycle } })) });
    expect((await adapter.inspect("local")).status).toBe(lifecycle);
  });

  it("marks old observations degraded and stale while preserving bounded telemetry", async () => {
    const adapter = createRuntimeControllerAdapter({ hosts: [hosts[0]!], now: () => now, staleAfterMs: 10_000, transport: transport(async () => observation({ observedAt: "2026-07-17T11:00:00.000Z" })) });
    expect(await adapter.inspect("local")).toMatchObject({ status: "degraded", stale: true, resources: { memoryUsedBytes: 4, memoryTotalBytes: 8, throughputPerSecond: 10 } });
  });

  it("preserves an authenticated controller rejection as auth-required without exposing the credential", async () => {
    let receivedCredential = "";
    const adapter = createRuntimeControllerAdapter({
      hosts: [hosts[2]!], now: () => now,
      resolveCredential: async () => "top-secret-runtime-token",
      transport: transport(async (_host, credential) => {
        receivedCredential = credential ?? "";
        return observation({ transport: "auth_required", kernel: "unknown", engine: { lifecycle: "idle" } });
      }),
    });
    const snapshot = await adapter.inspect("locked");
    expect(receivedCredential).toBe("top-secret-runtime-token");
    expect(snapshot).toMatchObject({ status: "auth_required", transport: "auth_required", kernel: "unknown" });
    expect(JSON.stringify(snapshot)).not.toContain("top-secret-runtime-token");
  });

  it("reports event loss, controller restart, stale state, and reconnect without leaking raw errors", async () => {
    let connection = 0;
    const cursors: Array<{ epoch?: string; sequence?: number }> = [];
    const eventTransport: RuntimeControllerTransport = {
      inspect: async () => observation(),
      stream: async function* (_host, _credential, cursor) {
        cursors.push(cursor);
        connection += 1;
        if (connection === 1) {
          yield observation({ sequence: 1 });
          yield { ...observation({ sequence: 3 }), token: "should-strip" } as RuntimeObservation;
          yield observation({ epoch: "boot-b", sequence: 1, observedAt: "2026-07-17T11:00:00.000Z" });
          throw new Error("private controller stack");
        }
        yield observation({ epoch: "boot-b", sequence: 2 });
      },
    };
    const adapter = createRuntimeControllerAdapter({ hosts: [hosts[0]!], now: () => now, staleAfterMs: 10_000, reconnectDelayMs: 0, transport: eventTransport, sleep: async () => undefined });
    const events = [];
    for await (const event of adapter.events("local", { maxEvents: 8, maxReconnects: 1 })) events.push(event);
    expect(events.map((event) => event.kind)).toEqual(["snapshot", "gap", "snapshot", "restart", "stale", "snapshot", "reconnect", "snapshot"]);
    expect(events.find((event) => event.kind === "gap")).toMatchObject({ after: 1, next: 3, lost: 1 });
    expect(events.find((event) => event.kind === "restart")).toMatchObject({ previousEpoch: "boot-a", epoch: "boot-b" });
    expect(cursors[1]).toEqual({ epoch: "boot-b", sequence: 1 });
    expect(JSON.stringify(events)).not.toMatch(/should-strip|private controller stack|endpoint/i);
  });

  it("fails actionably for an unknown host and caps the event stream", async () => {
    const adapter = createRuntimeControllerAdapter({ hosts: [hosts[0]!], now: () => now, transport: transport(async () => observation()) });
    await expect(adapter.inspect("missing")).rejects.toThrow(/unknown runtime host/i);
    const events = [];
    for await (const event of adapter.events("local", { maxEvents: 1 })) events.push(event);
    expect(events).toHaveLength(1);
  });
});
