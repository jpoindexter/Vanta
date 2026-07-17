import {
  RuntimeControllerEventSchema,
  RuntimeControllerSnapshotSchema,
  RuntimeHostConfigSchema,
  RuntimeObservationSchema,
  type RuntimeControllerAdapter,
  type RuntimeControllerCursor,
  type RuntimeControllerEvent,
  type RuntimeControllerSnapshot,
  type RuntimeControllerTransport,
  type RuntimeHostConfig,
  type RuntimeObservation,
} from "./types.js";

type RuntimeControllerOptions = {
  hosts: readonly RuntimeHostConfig[];
  transport: RuntimeControllerTransport;
  resolveCredential?: (reference: string) => Promise<string | undefined>;
  now?: () => number;
  staleAfterMs?: number;
  reconnectDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function offlineObservation(now: number, transport: "offline" | "auth_required"): RuntimeObservation {
  return {
    observedAt: new Date(now).toISOString(),
    epoch: "unobserved",
    sequence: 0,
    transport,
    kernel: "unknown",
    engine: { lifecycle: "idle" },
    resources: {},
    queueDepth: 0,
  };
}

function statusFor(observation: RuntimeObservation, stale: boolean): RuntimeControllerSnapshot["status"] {
  if (observation.transport === "offline") return "offline";
  if (observation.transport === "auth_required") return "auth_required";
  if (stale || observation.kernel !== "ready") return "degraded";
  return observation.engine.lifecycle;
}

function snapshotFor(host: RuntimeHostConfig, raw: RuntimeObservation, now: number, staleAfterMs: number): RuntimeControllerSnapshot {
  const observation = RuntimeObservationSchema.parse(raw);
  const stale = now - Date.parse(observation.observedAt) > staleAfterMs;
  return RuntimeControllerSnapshotSchema.parse({
    host: { id: host.id, label: host.label, kind: host.kind },
    status: statusFor(observation, stale),
    transport: observation.transport,
    kernel: observation.kernel,
    engine: observation.engine,
    resources: observation.resources,
    queueDepth: observation.queueDepth,
    observedAt: observation.observedAt,
    stale,
    epoch: observation.epoch,
    sequence: observation.sequence,
  });
}

function boundedInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value!)));
}

export function createRuntimeControllerAdapter(options: RuntimeControllerOptions): RuntimeControllerAdapter {
  const hosts = options.hosts.map((host) => RuntimeHostConfigSchema.parse(host));
  if (new Set(hosts.map((host) => host.id)).size !== hosts.length) throw new Error("runtime host ids must be unique");
  const byId = new Map(hosts.map((host) => [host.id, host]));
  const now = options.now ?? Date.now;
  const staleAfterMs = Math.max(1_000, options.staleAfterMs ?? 30_000);
  const reconnectDelayMs = Math.max(0, options.reconnectDelayMs ?? 500);
  const wait = options.sleep ?? sleep;

  function hostFor(id: string): RuntimeHostConfig {
    const host = byId.get(id);
    if (!host) throw new Error(`unknown runtime host: ${id}`);
    return host;
  }

  async function credentialFor(host: RuntimeHostConfig): Promise<{ ok: true; value?: string } | { ok: false }> {
    if (!host.credentialRef) return host.authRequired ? { ok: false } : { ok: true };
    const value = await options.resolveCredential?.(host.credentialRef);
    if (host.authRequired && !value) return { ok: false };
    return { ok: true, value };
  }

  async function inspectHost(host: RuntimeHostConfig): Promise<RuntimeControllerSnapshot> {
    const credential = await credentialFor(host);
    if (!credential.ok) return snapshotFor(host, offlineObservation(now(), "auth_required"), now(), staleAfterMs);
    try {
      return snapshotFor(host, await options.transport.inspect(host, credential.value), now(), staleAfterMs);
    } catch {
      return snapshotFor(host, offlineObservation(now(), "offline"), now(), staleAfterMs);
    }
  }

  async function* events(hostId: string, eventOptions: { cursor?: RuntimeControllerCursor; maxEvents?: number; maxReconnects?: number; signal?: AbortSignal } = {}): AsyncIterable<RuntimeControllerEvent> {
    const host = hostFor(hostId);
    const credential = await credentialFor(host);
    if (!credential.ok) {
      yield RuntimeControllerEventSchema.parse({ kind: "snapshot", hostId, snapshot: snapshotFor(host, offlineObservation(now(), "auth_required"), now(), staleAfterMs) });
      return;
    }
    const maxEvents = boundedInt(eventOptions.maxEvents, 100, 1, 1_000);
    const maxReconnects = boundedInt(eventOptions.maxReconnects, 3, 0, 10);
    let emitted = 0;
    let reconnects = 0;
    let epoch = eventOptions.cursor?.epoch;
    let sequence = eventOptions.cursor?.sequence ?? 0;

    while (!eventOptions.signal?.aborted && emitted < maxEvents) {
      try {
        for await (const raw of options.transport.stream(host, credential.value, { epoch, sequence }, eventOptions.signal)) {
          if (eventOptions.signal?.aborted || emitted >= maxEvents) return;
          const observation = RuntimeObservationSchema.parse(raw);
          if (epoch && observation.epoch !== epoch) {
            yield RuntimeControllerEventSchema.parse({ kind: "restart", hostId, previousEpoch: epoch, epoch: observation.epoch });
            emitted += 1;
            if (emitted >= maxEvents) return;
            sequence = 0;
          } else if (observation.epoch === epoch && observation.sequence > sequence + 1) {
            yield RuntimeControllerEventSchema.parse({ kind: "gap", hostId, epoch: observation.epoch, after: sequence, next: observation.sequence, lost: observation.sequence - sequence - 1 });
            emitted += 1;
            if (emitted >= maxEvents) return;
          }
          epoch = observation.epoch;
          sequence = observation.sequence;
          const snapshot = snapshotFor(host, observation, now(), staleAfterMs);
          if (snapshot.stale) {
            yield RuntimeControllerEventSchema.parse({ kind: "stale", hostId, observedAt: snapshot.observedAt });
            emitted += 1;
            if (emitted >= maxEvents) return;
          }
          yield RuntimeControllerEventSchema.parse({ kind: "snapshot", hostId, snapshot });
          emitted += 1;
          if (emitted >= maxEvents) return;
        }
        return;
      } catch {
        if (reconnects >= maxReconnects || eventOptions.signal?.aborted) return;
        reconnects += 1;
        yield RuntimeControllerEventSchema.parse({ kind: "reconnect", hostId, attempt: reconnects });
        emitted += 1;
        if (emitted >= maxEvents) return;
        await wait(reconnectDelayMs);
      }
    }
  }

  return {
    discover: () => Promise.all(hosts.map(inspectHost)),
    inspect: async (hostId) => inspectHost(hostFor(hostId)),
    events,
  };
}
