import { describe, it, expect } from "vitest";
import { isMemoryLifecycleHookName, MEMORY_LIFECYCLE_HOOKS, resolveBrain } from "./interface.js";

// The Brain port resolver: live by default, swappable by env, never throws.

describe("resolveBrain", () => {
  it("returns the live adapter by default", () => {
    expect(resolveBrain({}).id).toBe("live");
  });

  it("honors VANTA_BRAIN and falls back to live for unknown values", () => {
    expect(resolveBrain({ VANTA_BRAIN: "live" }).id).toBe("live");
    expect(resolveBrain({ VANTA_BRAIN: "does-not-exist" }).id).toBe("live");
  });

  it("exposes the full port surface", () => {
    const b = resolveBrain({});
    for (const m of ["read", "write", "remember", "recall", "digest", "health"] as const) {
      expect(typeof b[m]).toBe("function");
    }
  });

  it("exposes the memory lifecycle hook taxonomy without a hook bus", () => {
    const names = resolveBrain({}).lifecycleHooks.map((hook) => hook.name);
    expect(names).toEqual([
      "prefetch",
      "queue_prefetch",
      "sync_turn",
      "on_session_end",
      "on_session_switch",
      "on_pre_compress",
      "on_delegation",
    ]);
    expect(resolveBrain({}).lifecycleHooks).toBe(MEMORY_LIFECYCLE_HOOKS);
  });

  it("validates known memory lifecycle hook names", () => {
    expect(isMemoryLifecycleHookName("on_pre_compress")).toBe(true);
    expect(isMemoryLifecycleHookName("after_everything")).toBe(false);
  });
});
