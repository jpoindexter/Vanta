import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tool, ToolContext } from "../tools/types.js";
import {
  executeToolEffect,
  toolEffectDescriptorSha256,
  toolEffectPolicy,
} from "./tool-effect-gateway.js";
import { effectOperationKey } from "./gate-context.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vanta-tool-effect-"));
  roots.push(root);
  return root;
}

function tool(name: string, execute: Tool["execute"]): Tool {
  return {
    schema: { name, description: name, parameters: { type: "object", properties: {} } },
    describeForSafety: () => `${name} synthetic target`,
    execute,
  };
}

function context(root: string, operationId = "call-1"): ToolContext {
  return {
    root,
    sessionId: "session-1",
    effectCallId: operationId,
    safety: { assess: vi.fn(async () => ({ risk: "allow" as const, reason: "synthetic" })) } as unknown as ToolContext["safety"],
    requestApproval: vi.fn(async () => true),
  };
}

async function receiptText(root: string): Promise<string> {
  return readFile(join(root, ".vanta", "action-receipts.jsonl"), "utf8");
}

describe("tool effect policy", () => {
  it("keeps only explicit reads outside the gateway", () => {
    expect(toolEffectPolicy("apple_mail_audit")).toBe("read-only");
    expect(toolEffectPolicy("read_file")).toBe("read-only");
    expect(toolEffectPolicy("shell_cmd")).toBe("gateway");
    expect(toolEffectPolicy("mcp_files_write")).toBe("gateway");
    expect(toolEffectPolicy("vision_watch")).toBe("gateway");
    expect(toolEffectPolicy("screenshot")).toBe("gateway");
    expect(toolEffectPolicy("look_at_camera")).toBe("gateway");
    expect(toolEffectPolicy("look_at_screen")).toBe("gateway");
    expect(toolEffectPolicy("transcribe")).toBe("gateway");
    expect(toolEffectPolicy("life_search")).toBe("gateway");
    expect(toolEffectPolicy("recall")).toBe("gateway");
    expect(toolEffectPolicy("write_file")).toBe("gateway");
    expect(toolEffectPolicy("plugin_example_mutate")).toBe("gateway");
  });

  it("binds inner effect keys to scope and operation identity, not payload", () => {
    const ctx = context("/tmp/project", "stable-call");
    ctx.effectScopeId = "turn-1";
    expect(effectOperationKey("shell-background", ctx)).toBe("shell-background:turn-1:stable-call");
    expect(effectOperationKey("shell-background", { ...ctx, effectCallId: "next-call" }))
      .toBe("shell-background:turn-1:next-call");
  });
});

describe("executeToolEffect", () => {
  it("executes an explicit read directly without creating an effect receipt", async () => {
    const root = await temporaryRoot();
    const execute = vi.fn(async () => ({ ok: true, output: "contents", verification: { status: "verified" as const } }));
    const result = await executeToolEffect("read_file", {}, tool("read_file", execute), context(root));

    expect(result).toMatchObject({ ok: true, output: "contents" });
    expect(execute).toHaveBeenCalledTimes(1);
    await expect(receiptText(root)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("fails closed before an ordinary consequential tool when its stable operation id is absent", async () => {
    const root = await temporaryRoot();
    const execute = vi.fn(async () => ({ ok: true, output: "mutated" }));
    const ctx = context(root);
    delete ctx.effectCallId;

    const result = await executeToolEffect("write_file", { path: "x", content: "y" }, tool("write_file", execute), ctx);

    expect(result).toMatchObject({ ok: false, effectDisposition: "denied" });
    expect(result.output).toContain("stable operation id");
    expect(execute).not.toHaveBeenCalled();
  });

  it("fails closed before an ordinary consequential tool when the kernel is unreachable", async () => {
    const root = await temporaryRoot();
    const execute = vi.fn(async () => ({ ok: true, output: "mutated" }));
    const ctx = context(root);
    ctx.safety = { assess: async () => { throw new Error("offline"); } } as unknown as ToolContext["safety"];

    const result = await executeToolEffect("write_file", { path: "x", content: "y" }, tool("write_file", execute), ctx);

    expect(result).toMatchObject({ ok: false, effectDisposition: "denied" });
    expect(result.output).toContain("blocked");
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns a distinct inner approval to the same central gateway", async () => {
    const root = await temporaryRoot();
    const ctx = context(root);
    const originalApproval = ctx.requestApproval as ReturnType<typeof vi.fn>;
    const execute = vi.fn(async (_args: Record<string, unknown>, inner: ToolContext) => ({
      ok: await inner.requestApproval("inner action", "already covered"),
      output: "mutated",
    }));

    const result = await executeToolEffect("write_file", { path: "x" }, tool("write_file", execute), ctx);

    expect(result.ok).toBe(true);
    expect(ctx.safety.assess).toHaveBeenCalledTimes(2);
    expect(originalApproval).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("consumes matching dispatcher authority without reassessing", async () => {
    const root = await temporaryRoot();
    const ctx = context(root);
    ctx.effectScopeId = "turn-1";
    ctx.effectAuthority = {
      operationId: "call-1",
      scopeId: "turn-1",
      descriptorSha256: toolEffectDescriptorSha256(
        "write_file",
        { path: "x" },
        "write_file synthetic target",
      ),
      action: "write_file synthetic target",
      consumeExactApproval: true,
    };
    const originalApproval = ctx.requestApproval as ReturnType<typeof vi.fn>;
    const execute = vi.fn(async (_args: Record<string, unknown>, inner: ToolContext) => ({
      ok: await inner.requestApproval("WRITE_FILE synthetic target", "already covered"),
      output: "mutated",
    }));

    const result = await executeToolEffect("write_file", { path: "x" }, tool("write_file", execute), ctx);

    expect(result.ok).toBe(true);
    expect(ctx.safety.assess).not.toHaveBeenCalled();
    expect(originalApproval).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("journals an ordinary consequential tool and executes it once per operation id", async () => {
    const root = await temporaryRoot();
    const execute = vi.fn(async () => ({
      ok: true,
      output: "written",
      verification: { status: "verified" as const, evidence: "synthetic readback" },
    }));
    const mutation = tool("write_file", execute);
    const args = { path: "x", content: "sensitive-body-not-for-receipt" };

    const first = await executeToolEffect("write_file", args, mutation, context(root, "call-1"));
    const replay = await executeToolEffect("write_file", args, mutation, context(root, "call-1"));
    const second = await executeToolEffect("write_file", args, mutation, context(root, "call-2"));

    expect(first).toMatchObject({ ok: true, effectDisposition: "confirmed", verification: { status: "verified" } });
    expect(replay).toMatchObject({ ok: true, effectDisposition: "confirmed", verification: { status: "verified" } });
    expect(second).toMatchObject({ ok: true, effectDisposition: "confirmed", verification: { status: "verified" } });
    expect(execute).toHaveBeenCalledTimes(2);
    const receipts = await receiptText(root);
    expect(receipts).toContain('"disposition":"confirmed"');
    expect(receipts).not.toContain(args.content);
  });

  it("rejects argument drift under the same operation id without a second effect", async () => {
    const root = await temporaryRoot();
    const execute = vi.fn(async () => ({ ok: true, output: "mutated" }));
    const mutation = tool("write_file", execute);

    const first = await executeToolEffect("write_file", { path: "a", content: "one" }, mutation, context(root, "stable-call"));
    const drift = await executeToolEffect("write_file", { path: "a", content: "two" }, mutation, context(root, "stable-call"));

    expect(first.ok).toBe(true);
    expect(drift).toMatchObject({ ok: false, effectDisposition: "denied" });
    expect(drift.output).toContain("operation id was already bound");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("reports an uncertain throw honestly and never retries the operation", async () => {
    const root = await temporaryRoot();
    const execute = vi.fn(async () => { throw new Error("connection reset after mutation"); });

    const result = await executeToolEffect("write_file", { path: "x" }, tool("write_file", execute), context(root));

    expect(result).toMatchObject({ ok: false, effectDisposition: "unknown" });
    expect(result.output).toContain("unknown");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("preserves an executed compensation disposition instead of upgrading it", async () => {
    const root = await temporaryRoot();
    const execute = vi.fn(async () => ({
      ok: false,
      output: "readback mismatch; original restored",
      effectDisposition: "compensated" as const,
    }));

    const result = await executeToolEffect("calendar_update", { id: "event-1" }, tool("calendar_update", execute), context(root));

    expect(result).toMatchObject({ ok: false, effectDisposition: "compensated" });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
