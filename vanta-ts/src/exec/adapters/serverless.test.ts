import { describe, expect, it, vi } from "vitest";
import { serverlessCliStatus, type ServerlessCliRunner } from "./serverless.js";

describe("serverlessCliStatus", () => {
  it("reports an unavailable provider CLI", async () => {
    const run = vi.fn<ServerlessCliRunner>(async () => { throw new Error("ENOENT"); });
    await expect(serverlessCliStatus("modal", run)).resolves.toEqual({
      ok: false,
      reason: "modal CLI unavailable",
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("distinguishes an installed but unauthenticated Modal CLI", async () => {
    const run = vi.fn<ServerlessCliRunner>(async (_command, args) => {
      if (args[0] === "token") throw new Error("Token missing");
    });
    await expect(serverlessCliStatus("modal", run)).resolves.toEqual({
      ok: false,
      reason: "Modal CLI is installed but not authenticated; run `modal token new --verify`",
    });
    expect(run.mock.calls.map((call) => call[1])).toEqual([["--version"], ["token", "info"]]);
  });

  it("accepts an authenticated Modal CLI", async () => {
    const run = vi.fn<ServerlessCliRunner>(async () => undefined);
    await expect(serverlessCliStatus("modal", run)).resolves.toEqual({ ok: true });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("only requires the version probe for Daytona", async () => {
    const run = vi.fn<ServerlessCliRunner>(async () => undefined);
    await expect(serverlessCliStatus("daytona", run)).resolves.toEqual({ ok: true });
    expect(run).toHaveBeenCalledOnce();
  });
});
