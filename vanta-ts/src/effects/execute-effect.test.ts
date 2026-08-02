import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  effectPersistence,
  executeEffect,
  payloadSha256,
  type EffectGateContext,
  type EffectPersistence,
} from "./execute-effect.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "vanta-effect-"));
  roots.push(value);
  return value;
}

function context(projectRoot: string, risk: "allow" | "ask" | "block" = "allow"): EffectGateContext {
  return {
    kernel: {
      assess: async () => ({ risk, reason: risk === "ask" ? "operator decision" : risk }),
    },
    approval: { request: async () => true },
    projectRoot,
    sessionId: "session-1",
    permissionMode: "default",
  };
}

function intent(payload = "safe payload") {
  return {
    id: "effect-1",
    actor: "test-agent",
    host: "test-host",
    kind: "message.send",
    action: "send a test message to a synthetic channel",
    targetClass: "synthetic-channel",
    payloadSha256: payloadSha256(payload),
    idempotencyKey: "synthetic:message:1",
  };
}

async function allJournalText(projectRoot: string): Promise<string> {
  const journal = join(projectRoot, ".vanta", "effect-journal");
  const groups = await readdir(journal);
  const chunks: string[] = [];
  for (const group of groups) {
    if (group === "writer.lock") continue;
    for (const file of await readdir(join(journal, group))) {
      chunks.push(await readFile(join(journal, group, file), "utf8"));
    }
  }
  return chunks.join("\n");
}

describe("executeEffect", () => {
  it("fails closed before the operation when the kernel is unreachable", async () => {
    const projectRoot = await root();
    const operation = vi.fn();
    const result = await executeEffect(intent(), {
      ...context(projectRoot),
      kernel: { assess: async () => { throw new Error("offline"); } },
    }, operation);
    expect(result.outcome).toBe("blocked");
    expect(operation).not.toHaveBeenCalled();
  });

  it("records an exact ask denial without calling the operation", async () => {
    const projectRoot = await root();
    const operation = vi.fn();
    const request = vi.fn(async () => false);
    const result = await executeEffect(intent(), {
      ...context(projectRoot, "ask"),
      approval: { request },
    }, operation);
    expect(result.outcome).toBe("denied");
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      action: intent().action,
      intentId: intent().id,
      payloadSha256: intent().payloadSha256,
    }));
    expect(operation).not.toHaveBeenCalled();
  });

  it("persists requested and approved authority under the same effect WorkItem", async () => {
    const projectRoot = await root();
    await executeEffect(intent(), context(projectRoot, "ask"), async () => ({
      acknowledgementId: "ack-approved",
      verified: true,
    }));

    const approvals = (await readFile(join(projectRoot, ".vanta", "approvals.jsonl"), "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line));
    expect(approvals.map((approval) => approval.state)).toEqual(["requested", "approved"]);
    expect(approvals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        workItemId: "session-1:effect:effect-1",
        runId: "session-1:effect:effect-1",
        actionSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    ]));
  });

  it("settles an expired approval separately without calling the operation", async () => {
    const projectRoot = await root();
    const operation = vi.fn();
    const result = await executeEffect(intent(), {
      ...context(projectRoot, "ask"),
      approval: { request: async () => { throw new Error("approval timed out"); } },
    }, operation);

    expect(result.outcome).toBe("denied");
    expect(operation).not.toHaveBeenCalled();
    const approvals = (await readFile(join(projectRoot, ".vanta", "approvals.jsonl"), "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line));
    expect(approvals.map((approval) => approval.state)).toEqual(["requested", "expired"]);
    const receipt = JSON.parse((await readFile(join(projectRoot, ".vanta", "action-receipts.jsonl"), "utf8")).trim());
    expect(receipt).toMatchObject({ disposition: "expired" });
  });

  it("calls an allowed operation exactly once and retains only acknowledgement metadata", async () => {
    const projectRoot = await root();
    const secretBody = "secret-body-that-must-not-be-journaled";
    const operation = vi.fn(async () => ({
      value: "provider-value",
      acknowledgementId: "ack-1",
      verified: true,
    }));
    const result = await executeEffect(intent(secretBody), context(projectRoot), operation);
    expect(result).toMatchObject({ outcome: "verified", acknowledgementId: "ack-1", value: "provider-value" });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(await allJournalText(projectRoot)).not.toContain(secretBody);
  });

  it("settles a provider throw as unknown because the external effect may have happened", async () => {
    const projectRoot = await root();
    const cause = new Error("connection reset after send");
    const result = await executeEffect(intent(), context(projectRoot), async () => {
      throw cause;
    });
    expect(result).toMatchObject({ outcome: "unknown", operationError: cause });
    expect(await allJournalText(projectRoot)).not.toContain(cause.message);
  });

  it("records a definitive provider failure without upgrading it to confirmation", async () => {
    const projectRoot = await root();
    const result = await executeEffect(intent(), context(projectRoot), async () => ({
      value: "provider rejected request",
      failed: true,
    }));
    expect(result).toMatchObject({ outcome: "failed", value: "provider rejected request" });
  });

  it("fails closed before the operation when durable pending persistence is unavailable", async () => {
    const projectRoot = await root();
    const blocker = join(projectRoot, "not-a-directory");
    await writeFile(blocker, "x");
    const operation = vi.fn();
    await expect(executeEffect(intent(), { ...context(blocker), projectRoot: blocker }, operation))
      .rejects.toThrow();
    expect(operation).not.toHaveBeenCalled();
  });

  it("does not repeat an effect after a crash between provider acknowledgement and settlement", async () => {
    const projectRoot = await root();
    const operation = vi.fn(async () => ({ acknowledgementId: "ack-crash", verified: true }));
    const crashOnSettlement: EffectPersistence = {
      persist: async (ctx, value, transition, outcome) => {
        if (transition === "settled") throw new Error("simulated crash before settlement");
        await effectPersistence.persist(ctx, value, transition, outcome);
      },
    };
    await expect(executeEffect(intent(), context(projectRoot), operation, { persistence: crashOnSettlement }))
      .rejects.toThrow("simulated crash");
    expect(operation).toHaveBeenCalledTimes(1);

    const replay = await executeEffect(intent(), context(projectRoot), operation);
    expect(replay.outcome).toBe("unknown");
    expect(operation).toHaveBeenCalledTimes(1);
    const workItems = (await readFile(join(projectRoot, ".vanta", "work-items.jsonl"), "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line));
    expect(workItems.at(-1)).toMatchObject({
      state: "needs human",
      waitCondition: "External effect settlement is uncertain",
    });
  });
});
