import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realpathSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildModelSeatbeltProfile, executeTaskModel, type ModelSandboxReceipt } from "./model-sandbox.js";

const canRunSeatbelt = process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec");
const input = { state: { count: 1 }, action: { type: "increment" }, timeline: [{ sequence: 1 }] };

function receiptSink() {
  const receipts: ModelSandboxReceipt[] = [];
  return { receipts, recordReceipt: async (receipt: ModelSandboxReceipt) => { receipts.push(receipt); } };
}

describe("model sandbox profile", () => {
  it("denies ambient reads, network, and writes outside the disposable workspace", () => {
    const profile = buildModelSeatbeltProfile("/private/tmp/model-workspace", process.execPath);
    expect(profile).toContain("(deny default)");
    expect(profile).toContain("(deny network*)");
    expect(profile).toContain('(allow file-read* (subpath "/private/tmp/model-workspace"))');
    expect(profile).toContain('(allow file-write* (subpath "/private/tmp/model-workspace"))');
    expect(profile).toContain(`(deny file* (subpath "${realpathSync(tmpdir())}"))`);
    expect(profile).not.toContain('(allow file-write* (subpath "/private/tmp"))');
  });
});

describe.skipIf(!canRunSeatbelt)("executable task model sandbox", () => {
  it("runs a deterministic model with declared immutable inputs and a receipt", async () => {
    const sink = receiptSink();
    const result = await executeTaskModel({
      source: `({
        step(input) { return { count: input.state.count + 1, timeline: input.timeline.length }; },
        isGoal(state) { return state.count === 2; }
      })`,
      input,
      limits: { timeoutMs: 500, memoryMb: 64, maxOutputBytes: 32_000 },
      recordReceipt: sink.recordReceipt,
    });

    expect(result).toMatchObject({ ok: true, predicted: { count: 2, timeline: 1 }, goal: true });
    expect(sink.receipts).toHaveLength(1);
    expect(sink.receipts[0]).toMatchObject({ status: "completed", network: "denied", environment: "empty" });
  });

  it("fails closed when a model attempts to escape through host globals", async () => {
    const sink = receiptSink();
    const result = await executeTaskModel({
      source: `({
        step() { return globalThis.constructor.constructor("return process")().env; },
        isGoal() { return false; }
      })`,
      input,
      recordReceipt: sink.recordReceipt,
    });

    expect(result.ok).toBe(false);
    expect(result.receipt.status).toBe("sandbox_violation");
    expect(JSON.stringify(result)).not.toContain("OPENAI_API_KEY");
  });

  it("fails closed when a model attempts to read an undeclared secret file", async () => {
    const outside = await mkdtemp(join(tmpdir(), "vanta-model-secret-"));
    const secretPath = join(outside, "secret.txt");
    await writeFile(secretPath, "DO_NOT_EXPOSE_MODEL_SECRET", "utf8");
    const sink = receiptSink();
    try {
      const result = await executeTaskModel({
        source: `({
          step() {
            const process = globalThis.constructor.constructor("return process")();
            return process.getBuiltinModule("node:fs").readFileSync(${JSON.stringify(secretPath)}, "utf8");
          },
          isGoal() { return false; }
        })`,
        input,
        recordReceipt: sink.recordReceipt,
      });
      expect(result.ok).toBe(false);
      expect(result.receipt.status).toBe("sandbox_violation");
      expect(JSON.stringify(result)).not.toContain("DO_NOT_EXPOSE_MODEL_SECRET");
      expect(await readFile(secretPath, "utf8")).toBe("DO_NOT_EXPOSE_MODEL_SECRET");
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("kills an infinite loop at the hard timeout", async () => {
    const sink = receiptSink();
    const result = await executeTaskModel({
      source: `({ step() { while (true) {} }, isGoal() { return false; } })`,
      input,
      limits: { timeoutMs: 100, memoryMb: 64, maxOutputBytes: 32_000 },
      recordReceipt: sink.recordReceipt,
    });
    expect(result.ok).toBe(false);
    expect(result.receipt.status).toBe("timeout");
  });

  it("rejects nondeterministic output from identical declared inputs", async () => {
    const sink = receiptSink();
    const result = await executeTaskModel({
      source: `({ step() { return { value: Math.random() }; }, isGoal() { return false; } })`,
      input,
      recordReceipt: sink.recordReceipt,
    });
    expect(result.ok).toBe(false);
    expect(result.receipt.status).toBe("nondeterministic");
  });

  it("keeps timeline input immutable", async () => {
    const sink = receiptSink();
    const result = await executeTaskModel({
      source: `({ step(input) { input.timeline.push({ sequence: 2 }); return input.state; }, isGoal() { return false; } })`,
      input,
      recordReceipt: sink.recordReceipt,
    });
    expect(result.ok).toBe(false);
    expect(result.receipt.status).toBe("runtime_error");
    expect(input.timeline).toEqual([{ sequence: 1 }]);
  });

  it("fails closed under the configured heap limit", async () => {
    const sink = receiptSink();
    const result = await executeTaskModel({
      source: `({ step() { return new Array(20_000_000).fill("memory"); }, isGoal() { return false; } })`,
      input,
      limits: { timeoutMs: 2_000, memoryMb: 32, maxOutputBytes: 32_000 },
      recordReceipt: sink.recordReceipt,
    });
    expect(result.ok).toBe(false);
    expect(["memory_limit", "timeout"]).toContain(result.receipt.status);
  });
});

describe("unsupported sandbox backend", () => {
  it("refuses to run instead of falling back to an unsandboxed process", async () => {
    const sink = receiptSink();
    const result = await executeTaskModel({
      source: `({ step(input) { return input.state; }, isGoal() { return true; } })`,
      input,
      platform: "win32",
      recordReceipt: sink.recordReceipt,
    });
    expect(result.ok).toBe(false);
    expect(result.receipt.status).toBe("sandbox_unavailable");
  });
});
