import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import {
  verifyGithubSignature,
  resolveDeliver,
  startWebhookServer,
  type WebhookServer,
} from "./webhook.js";

function sign(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("verifyGithubSignature", () => {
  const secret = "s3cr3t";
  const body = '{"action":"opened"}';

  it("accepts a correct signature", () => {
    expect(verifyGithubSignature(secret, body, sign(secret, body))).toBe(true);
  });
  it("rejects a wrong signature", () => {
    expect(verifyGithubSignature(secret, body, sign("wrong", body))).toBe(false);
  });
  it("rejects a missing signature", () => {
    expect(verifyGithubSignature(secret, body, undefined)).toBe(false);
  });
  it("rejects a tampered body", () => {
    expect(verifyGithubSignature(secret, '{"action":"closed"}', sign(secret, body))).toBe(false);
  });
});

describe("resolveDeliver", () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("appends to a file target", async () => {
    dir = await mkdtemp(join(tmpdir(), "argo-deliver-"));
    const path = join(dir, "out.log");
    const deliver = resolveDeliver(`file:${path}`);
    await deliver("line one");
    await deliver("line two");
    expect(await readFile(path, "utf8")).toBe("line one\nline two\n");
  });

  it("routes telegram targets to the injected sender", async () => {
    const sent: Array<[string, string]> = [];
    const deliver = resolveDeliver("telegram:42", async (chatId, text) => void sent.push([chatId, text]));
    await deliver("ping");
    expect(sent).toEqual([["42", "ping"]]);
  });

  it("throws on a telegram target with no sender, and on unknown targets", () => {
    expect(() => resolveDeliver("telegram:1")).toThrow(/VANTA_TELEGRAM_TOKEN/);
    expect(() => resolveDeliver("carrier-pigeon")).toThrow(/unknown deliver target/);
  });
});

describe("startWebhookServer (integration)", () => {
  let srv: WebhookServer;
  afterEach(async () => {
    if (srv) await srv.close();
  });

  it("runs onEvent for a correctly-signed POST and 401s an unsigned one", async () => {
    const secret = "hook-secret";
    const received: string[] = [];
    srv = await startWebhookServer({
      port: 0, // ephemeral
      secret,
      onEvent: (body) => void received.push(body),
      log: () => {},
    });
    const url = `http://127.0.0.1:${srv.port}`;
    const body = '{"pull_request":{"title":"Fix it"}}';

    const bad = await fetch(url, { method: "POST", body });
    expect(bad.status).toBe(401);

    const ok = await fetch(url, {
      method: "POST",
      body,
      headers: { "x-hub-signature-256": sign(secret, body) },
    });
    expect(ok.status).toBe(200);
    // onEvent fires after the 200; give the microtask a beat.
    await new Promise((r) => setImmediate(r));
    expect(received).toEqual([body]);
  });

  it("rejects non-POST methods", async () => {
    srv = await startWebhookServer({ port: 0, onEvent: () => {}, log: () => {} });
    const res = await fetch(`http://127.0.0.1:${srv.port}`, { method: "GET" });
    expect(res.status).toBe(405);
  });
});
