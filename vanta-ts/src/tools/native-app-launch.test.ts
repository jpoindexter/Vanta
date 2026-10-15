import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeToolEffect } from "../effects/tool-effect-gateway.js";
import { createNativeAppLaunchTool } from "./native-app-launch.js";
import type { ToolContext } from "./types.js";
import type { NativeAppAdapter } from "./native-app-launch-run.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));
const app = { bundleId: "com.apple.calculator", path: "/System/Applications/Calculator.app" };
const args = { bundle_id: app.bundleId };

async function fixture(risk: "allow" | "ask" | "block" = "allow", approved = true) {
  const root = await mkdtemp(join(tmpdir(), "vanta-native-app-test-"));
  roots.push(root);
  const adapter = { resolve: vi.fn<NativeAppAdapter["resolve"]>(async () => app), launch: vi.fn(async () => {}) };
  const ctx: ToolContext = { root, sessionId: "test", effectCallId: "one", effectScopeId: "test",
    safety: { assess: vi.fn(async () => ({ risk })) } as unknown as ToolContext["safety"],
    requestApproval: vi.fn(async () => approved) };
  const tool = createNativeAppLaunchTool({ platform: "darwin", adapter });
  const run = (input: Record<string, unknown> = args) => executeToolEffect(tool.schema.name, input, tool, ctx);
  return { adapter, ctx, tool, run };
}

describe("native_app_launch authority and results", () => {
  it("requires matching gateway authority even when directly invoked", async () => {
    const f = await fixture();
    const result = await f.tool.execute(args, f.ctx);
    expect(result).toMatchObject({ ok: false, effectDisposition: "denied" });
    expect(f.adapter.resolve).not.toHaveBeenCalled();
  });

  it.each([{ bundle_id: "../Calculator" }, { bundle_id: "com.apple.calculator;open" }, { bundle_id: "com.apple.calculator", arguments: ["x"] }])("rejects malformed or expanded requests before resolving: %j", async (input) => {
    const f = await fixture();
    expect(await f.run(input)).toMatchObject({ ok: false, effectDisposition: "denied" });
    expect(f.adapter.resolve).not.toHaveBeenCalled();
  });

  it.each([["ask", false], ["block", true]] as const)("stops before lookup/launch on %s with approval %s", async (risk, approved) => {
    const f = await fixture(risk, approved);
    expect(await f.run()).toMatchObject({ ok: false, effectDisposition: "denied" });
    expect(f.adapter.resolve).not.toHaveBeenCalled();
    expect(f.adapter.launch).not.toHaveBeenCalled();
  });

  it("accepts one approved launch, does not double prompt, and never claims visible verification", async () => {
    const f = await fixture("ask");
    expect(await f.run()).toMatchObject({ ok: true, effectDisposition: "confirmed", verification: { status: "unverified" } });
    expect(f.ctx.requestApproval).toHaveBeenCalledOnce();
    expect(f.adapter.launch).toHaveBeenCalledExactlyOnceWith(app);
    expect((await f.run()).output).toContain("not repeated");
    expect(f.adapter.launch).toHaveBeenCalledOnce();
  });

  it("reports unknown after a launch error and never retries or exposes raw errors", async () => {
    const f = await fixture();
    f.adapter.launch.mockRejectedValue(new Error("private diagnostic secret"));
    const result = await f.run();
    expect(result).toMatchObject({ ok: false, effectDisposition: "unknown", verification: { status: "unverified" } });
    expect(result.output).toContain("Do not retry automatically");
    expect(result.output).not.toContain("private diagnostic secret");
    await f.run();
    expect(f.adapter.launch).toHaveBeenCalledOnce();
  });

  it("stops without launch when the app is unresolved or identity changed", async () => {
    const f = await fixture();
    f.adapter.resolve.mockResolvedValue({ ...app, bundleId: "com.other.app" });
    expect(await f.run()).toMatchObject({ ok: false, effectDisposition: "denied" });
    expect(f.adapter.launch).not.toHaveBeenCalled();
  });

  it("does not launch when the exact bundle is missing or lookup rejects", async () => {
    const f = await fixture();
    f.adapter.resolve.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("private lookup"));
    expect((await f.run()).output).toContain("No installed application resolved");
    f.ctx.effectCallId = "second-lookup";
    const failed = await f.run();
    expect(failed.output).toContain("identity lookup failed");
    expect(failed.output).not.toContain("private lookup");
    expect(f.adapter.launch).not.toHaveBeenCalled();
  });

  it("refuses a descriptor from another app even when the scope and call ID match", async () => {
    const f = await fixture();
    f.ctx.effectAuthority = { operationId: "one", scopeId: "test", descriptorSha256: "0".repeat(64) };
    expect(await f.tool.execute(args, f.ctx)).toMatchObject({ ok: false, effectDisposition: "denied" });
    expect(f.adapter.resolve).not.toHaveBeenCalled();
  });

  it("stops on unsupported platforms without querying the OS", async () => {
    const f = await fixture();
    const tool = createNativeAppLaunchTool({ platform: "linux", adapter: f.adapter });
    const result = await executeToolEffect(tool.schema.name, args, tool, f.ctx);
    expect(result).toMatchObject({ ok: false, effectDisposition: "denied" });
    expect(f.adapter.resolve).not.toHaveBeenCalled();
  });
});
