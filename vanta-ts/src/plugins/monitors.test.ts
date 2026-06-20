import { describe, expect, it, vi } from "vitest";
import { armMonitors, disarmMonitors, MonitorSchema, type Monitor, type MonitorDeps } from "./monitors.js";
import { parsePluginManifest } from "./manifest.js";

function manifest(monitors?: Monitor[]) {
  return parsePluginManifest({ name: "watcher", version: "0.1.0", ...(monitors ? { monitors } : {}) });
}

function fakeDeps(overrides: Partial<MonitorDeps> = {}): MonitorDeps & {
  schedule: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
} {
  const schedule = vi.fn((_ms: number, _fire: () => void) => vi.fn());
  const run = vi.fn();
  return { schedule, run, ...overrides } as never;
}

describe("MonitorSchema", () => {
  it("accepts a command monitor on an interval", () => {
    expect(MonitorSchema.parse({ name: "tick", command: "echo hi", intervalMs: 1000 })).toMatchObject({
      name: "tick",
      command: "echo hi",
      intervalMs: 1000,
    });
  });

  it("accepts an event-only monitor", () => {
    expect(MonitorSchema.parse({ name: "on-save", event: "file_changed" })).toMatchObject({ event: "file_changed" });
  });

  it("rejects a monitor with neither command nor event", () => {
    expect(() => MonitorSchema.parse({ name: "empty" })).toThrow();
  });

  it("rejects unknown keys and a non-positive interval", () => {
    expect(() => MonitorSchema.parse({ name: "x", command: "y", postinstall: "z" })).toThrow();
    expect(() => MonitorSchema.parse({ name: "x", command: "y", intervalMs: 0 })).toThrow();
  });
});

describe("plugin manifest monitors field", () => {
  it("parses an optional monitors array", () => {
    const parsed = parsePluginManifest({
      name: "watcher",
      version: "0.1.0",
      monitors: [{ name: "tick", command: "echo", intervalMs: 500 }],
    });
    expect(parsed.monitors).toHaveLength(1);
  });

  it("a plugin without monitors leaves the field undefined (byte-identical to today)", () => {
    const a = parsePluginManifest({ name: "watcher", version: "0.1.0" });
    expect(a.monitors).toBeUndefined();
    expect(a).toMatchObject({ name: "watcher", version: "0.1.0", main: "index.js" });
  });
});

describe("armMonitors", () => {
  it("no monitors declared → no-op: empty handles, schedule never called", () => {
    const deps = fakeDeps();
    const handles = armMonitors(manifest(), deps);
    expect(handles).toEqual([]);
    expect(deps.schedule).not.toHaveBeenCalled();
    expect(deps.run).not.toHaveBeenCalled();
  });

  it("arms each interval monitor via schedule and returns a handle per monitor", () => {
    const deps = fakeDeps();
    const handles = armMonitors(
      manifest([
        { name: "a", command: "echo a", intervalMs: 100 },
        { name: "b", command: "echo b", intervalMs: 200 },
      ]),
      deps,
    );
    expect(handles.map((h) => h.name)).toEqual(["a", "b"]);
    expect(deps.schedule).toHaveBeenCalledTimes(2);
    expect(deps.schedule).toHaveBeenCalledWith(100, expect.any(Function));
    expect(deps.schedule).toHaveBeenCalledWith(200, expect.any(Function));
  });

  it("the scheduled tick fires the monitor's run", () => {
    let fire: (() => void) | undefined;
    const deps = fakeDeps({ schedule: vi.fn((_ms, f) => { fire = f; return vi.fn(); }) as never });
    const monitor: Monitor = { name: "a", command: "echo a", intervalMs: 100 };
    armMonitors(manifest([monitor]), deps);
    expect(deps.run).not.toHaveBeenCalled();
    fire?.();
    expect(deps.run).toHaveBeenCalledWith(monitor);
  });

  it("an event-only monitor arms passively (no schedule call) but still returns a handle", () => {
    const deps = fakeDeps();
    const handles = armMonitors(manifest([{ name: "on-save", event: "file_changed" }]), deps);
    expect(handles).toHaveLength(1);
    expect(handles[0]?.name).toBe("on-save");
    expect(deps.schedule).not.toHaveBeenCalled();
  });

  it("a run that throws never breaks arming (errors-as-values)", () => {
    let fire: (() => void) | undefined;
    const deps = fakeDeps({
      schedule: vi.fn((_ms, f) => { fire = f; return vi.fn(); }) as never,
      run: vi.fn(() => { throw new Error("boom"); }) as never,
    });
    armMonitors(manifest([{ name: "a", command: "x", intervalMs: 100 }]), deps);
    expect(() => fire?.()).not.toThrow();
  });

  it("one monitor that fails to arm is skipped, the rest still arm", () => {
    let calls = 0;
    const deps = fakeDeps({
      schedule: vi.fn((_ms, _f) => {
        calls += 1;
        if (calls === 1) throw new Error("arm failed");
        return vi.fn();
      }) as never,
    });
    const handles = armMonitors(
      manifest([
        { name: "bad", command: "x", intervalMs: 100 },
        { name: "good", command: "y", intervalMs: 200 },
      ]),
      deps,
    );
    expect(handles.map((h) => h.name)).toEqual(["good"]);
  });
});

describe("disarmMonitors", () => {
  it("calls disarm on every handle", () => {
    const disarmA = vi.fn();
    const disarmB = vi.fn();
    const deps = fakeDeps({
      schedule: vi.fn()
        .mockReturnValueOnce(disarmA)
        .mockReturnValueOnce(disarmB) as never,
    });
    const handles = armMonitors(
      manifest([
        { name: "a", command: "x", intervalMs: 100 },
        { name: "b", command: "y", intervalMs: 200 },
      ]),
      deps,
    );
    disarmMonitors(handles);
    expect(disarmA).toHaveBeenCalledTimes(1);
    expect(disarmB).toHaveBeenCalledTimes(1);
  });

  it("a failing disarm does not block the rest", () => {
    const ok = vi.fn();
    const handles = [
      { name: "bad", disarm: () => { throw new Error("nope"); } },
      { name: "good", disarm: ok },
    ];
    expect(() => disarmMonitors(handles)).not.toThrow();
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("disarming an event-only (passive) handle is a safe no-op", () => {
    const handles = armMonitors(manifest([{ name: "on-save", event: "evt" }]), fakeDeps());
    expect(() => disarmMonitors(handles)).not.toThrow();
  });
});
