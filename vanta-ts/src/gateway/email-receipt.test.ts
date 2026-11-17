import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EffectGateContext } from "../effects/execute-effect.js";
import { sendGatewayMessage } from "./effect-send.js";
import { EmailAdapter } from "./platforms/email.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function delivery(sendMail: () => Promise<void>) {
  const projectRoot = await mkdtemp(join(tmpdir(), "vanta-email-receipt-"));
  roots.push(projectRoot);
  const gate: EffectGateContext = {
    projectRoot,
    sessionId: "synthetic-email",
    permissionMode: "default",
    kernel: { assess: async () => ({ risk: "allow" }) },
  };
  const options = {
    platform: new EmailAdapter({ transport: { fetchInbox: async () => [], sendMail } }),
    gate,
    message: { chatId: "recipient@example.test", text: "private-body-marker" },
    kind: "gateway.final" as const,
    idempotencyKey: "synthetic-email:final",
  };
  const receipts = async () => (await readFile(join(projectRoot, ".vanta", "action-receipts.jsonl"), "utf8"))
    .trim().split("\n").map((line) => JSON.parse(line));
  return { options, receipts };
}

describe("email gateway delivery receipts", () => {
  it("retains unknown after SMTP rejection and never retries the consumed send", async () => {
    const sendMail = vi.fn(async () => { throw new Error("private-error-marker"); });
    const { options, receipts } = await delivery(sendMail);
    await expect(sendGatewayMessage(options)).rejects.toThrow("gateway effect unknown: gateway.final");
    await expect(sendGatewayMessage(options)).rejects.toThrow("gateway effect unknown: gateway.final");
    expect(sendMail).toHaveBeenCalledTimes(1);
    const records = await receipts();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ disposition: "unknown", verification: "unverified" });
    expect(JSON.stringify(records)).not.toMatch(/private-body-marker|private-error-marker/);
  });

  it("records a resolved SMTP send as confirmed but not recipient-verified", async () => {
    const sendMail = vi.fn(async () => {});
    const { options, receipts } = await delivery(sendMail);
    await expect(sendGatewayMessage(options)).resolves.toBeUndefined();
    await expect(sendGatewayMessage(options)).resolves.toBeUndefined();
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(await receipts()).toEqual([expect.objectContaining({ disposition: "confirmed", verification: "unverified" })]);
  });

  it("records approval denial without attempting SMTP", async () => {
    const sendMail = vi.fn(async () => {});
    const { options, receipts } = await delivery(sendMail);
    options.gate.kernel.assess = async () => ({ risk: "ask" });
    options.gate.approval = { request: async () => false };
    await expect(sendGatewayMessage(options)).rejects.toThrow("gateway effect denied: gateway.final");
    expect(sendMail).not.toHaveBeenCalled();
    expect(await receipts()).toEqual([expect.objectContaining({ disposition: "denied" })]);
  });
});
