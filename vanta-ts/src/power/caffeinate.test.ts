import { describe, it, expect, vi } from "vitest";
import {
  withCaffeinate,
  resolveCaffeinate,
  type CaffeinateChild,
  type SpawnCaffeinate,
} from "./caffeinate.js";

/** A fake spawn that records the args it was called with and returns a child
 * whose `kill` is a spy, so a test can assert "started then killed". */
function fakeSpawn(): {
  spawn: SpawnCaffeinate;
  calls: { command: string; args: string[] }[];
  kill: ReturnType<typeof vi.fn>;
} {
  const kill = vi.fn(() => true);
  const calls: { command: string; args: string[] }[] = [];
  const spawn: SpawnCaffeinate = (command, args) => {
    calls.push({ command, args });
    return { kill } as CaffeinateChild;
  };
  return { spawn, calls, kill };
}

describe("resolveCaffeinate", () => {
  it("is off by default when VANTA_CAFFEINATE is unset", () => {
    expect(resolveCaffeinate({})).toBe(false);
  });

  it("is on for truthy values (1/true/yes/on, case-insensitive)", () => {
    for (const v of ["1", "true", "TRUE", "yes", "On", " on "]) {
      expect(resolveCaffeinate({ VANTA_CAFFEINATE: v })).toBe(true);
    }
  });

  it("is off for other values", () => {
    for (const v of ["0", "false", "no", "off", ""]) {
      expect(resolveCaffeinate({ VANTA_CAFFEINATE: v })).toBe(false);
    }
  });
});

describe("withCaffeinate", () => {
  it("on macOS + enabled: spawns caffeinate then kills it", async () => {
    const { spawn, calls, kill } = fakeSpawn();
    const result = await withCaffeinate(async () => "ran", {
      spawn,
      platform: "darwin",
      enabled: true,
    });

    expect(result).toBe("ran");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe("caffeinate");
    expect(calls[0]?.args).toEqual(["-i"]);
    expect(kill).toHaveBeenCalledTimes(1);
  });

  it("disabled: runs fn with no spawn", async () => {
    const { spawn, calls, kill } = fakeSpawn();
    const result = await withCaffeinate(async () => 42, {
      spawn,
      platform: "darwin",
      enabled: false,
    });

    expect(result).toBe(42);
    expect(calls).toHaveLength(0);
    expect(kill).not.toHaveBeenCalled();
  });

  it("non-macOS: runs fn with no spawn even when enabled", async () => {
    const { spawn, calls, kill } = fakeSpawn();
    const result = await withCaffeinate(async () => "linux", {
      spawn,
      platform: "linux",
      enabled: true,
    });

    expect(result).toBe("linux");
    expect(calls).toHaveLength(0);
    expect(kill).not.toHaveBeenCalled();
  });

  it("kills caffeinate even when fn throws, and re-throws", async () => {
    const { spawn, calls, kill } = fakeSpawn();
    const boom = new Error("operation failed");

    await expect(
      withCaffeinate(
        async () => {
          throw boom;
        },
        { spawn, platform: "darwin", enabled: true },
      ),
    ).rejects.toThrow("operation failed");

    expect(calls).toHaveLength(1);
    expect(kill).toHaveBeenCalledTimes(1);
  });

  it("a spawn failure never breaks the operation (errors-as-values)", async () => {
    const failingSpawn: SpawnCaffeinate = () => {
      throw new Error("caffeinate not found");
    };
    const result = await withCaffeinate(async () => "ok", {
      spawn: failingSpawn,
      platform: "darwin",
      enabled: true,
    });

    expect(result).toBe("ok");
  });

  it("a kill failure never breaks the operation", async () => {
    const kill = vi.fn(() => {
      throw new Error("ESRCH");
    });
    const spawn: SpawnCaffeinate = () => ({ kill }) as CaffeinateChild;
    const result = await withCaffeinate(async () => "done", {
      spawn,
      platform: "darwin",
      enabled: true,
    });

    expect(result).toBe("done");
    expect(kill).toHaveBeenCalledTimes(1);
  });

  it("defaults (no deps) are off: runs fn with no real spawn", async () => {
    // enabled defaults to undefined → off, so no caffeinate process is spawned
    // regardless of the host platform.
    const result = await withCaffeinate(async () => "default-off");
    expect(result).toBe("default-off");
  });
});
