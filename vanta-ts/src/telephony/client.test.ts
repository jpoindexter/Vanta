import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { NumberSearchSchema, TelephonyActionSchema, TelephonyProfileSchema } from "./schema.js";
import { executeTelephonyAction, searchTelephonyNumbers } from "./client.js";

const profile = TelephonyProfileSchema.parse({ version: 1, environment: "test", provider: "twilio", accountSid: `AC${"1".repeat(32)}`, authTokenVaultAlias: "TWILIO_TEST_TOKEN", from: "+15005550006", scopes: ["numbers", "sms", "voice"] });
const common = { version: 1, profile, idempotencyKey: "00000000-0000-4000-8000-000000000001", purpose: "test", window: { notBefore: "2026-07-11T11:00:00Z", notAfter: "2099-07-11T13:00:00Z" }, expiresAt: "2099-07-11T13:00:00Z", retention: { receiptDays: 30, transcriptDays: 0 } };
const servers: ReturnType<typeof createServer>[] = [];

async function fixture(responder: (path: string, body: URLSearchParams, req: IncomingMessage) => unknown): Promise<string> {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const output = JSON.stringify(responder(req.url ?? "", new URLSearchParams(Buffer.concat(chunks).toString()), req));
    res.writeHead(201, { "content-type": "application/json", "content-length": Buffer.byteLength(output) }); res.end(output);
  });
  servers.push(server); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); if (!address || typeof address === "string") throw new Error("fixture missing");
  return `http://127.0.0.1:${address.port}`;
}
afterEach(async () => { for (const server of servers.splice(0)) { server.close(); await once(server, "close"); } });

describe("Twilio telephony client", () => {
  it("sends SMS through a real local HTTP fixture without returning credentials or body", async () => {
    let auth = "", form: URLSearchParams | undefined;
    const apiBase = await fixture((_path, body, req) => { auth = String(req.headers.authorization); form = body; return { sid: `SM${"2".repeat(32)}`, status: "queued", body: "must not return" }; });
    const action = TelephonyActionSchema.parse({ ...common, id: "tel_sms_client12", action: "sms", recipient: "+15005550009", consent: { source: "test", obtainedAt: "2026-07-11T10:00:00Z", expiresAt: "2099-07-12T00:00:00Z" }, statusCallbackUrl: "https://callbacks.example/twilio", body: "hello" });
    const result = await executeTelephonyAction(action, { apiBase, resolveToken: async () => "fixture-token" });
    expect(result).toMatchObject({ ok: true, state: "accepted", providerStatus: "queued" });
    expect(form?.get("Body")).toBe("hello"); expect(auth).toContain("Basic "); expect(JSON.stringify(result)).not.toMatch(/fixture-token|must not return|hello/);
  });

  it("creates a bounded call and a number provision request", async () => {
    const forms: URLSearchParams[] = [];
    const apiBase = await fixture((path, body) => { forms.push(body); return { sid: `${path.includes("Calls") ? "CA" : "PN"}${"3".repeat(32)}`, status: "queued" }; });
    const consent = { source: "test", obtainedAt: "2026-07-11T10:00:00Z", expiresAt: "2099-07-12T00:00:00Z" };
    const call = TelephonyActionSchema.parse({ ...common, id: "tel_call_client1", action: "call", recipient: "+15005550009", consent, statusCallbackUrl: "https://callbacks.example/twilio", spokenMessage: "test call", maximumDurationSeconds: 20, recording: { enabled: false } });
    const number = TelephonyActionSchema.parse({ ...common, id: "tel_number_client", action: "number_provision", phoneNumber: "+15005550010", voiceCallbackUrl: "https://callbacks.example/voice", smsCallbackUrl: "https://callbacks.example/sms" });
    expect((await executeTelephonyAction(call, { apiBase, resolveToken: async () => "token" })).providerId).toMatch(/^CA/);
    expect((await executeTelephonyAction(number, { apiBase, resolveToken: async () => "token" })).providerId).toMatch(/^PN/);
    expect(forms[0]?.get("TimeLimit")).toBe("20"); expect(forms[1]?.get("PhoneNumber")).toBe("+15005550010");
  });

  it("returns only safe fields from number search", async () => {
    const apiBase = await fixture(() => ({ available_phone_numbers: [{ phone_number: "+15005550010", friendly_name: "(500) 555-0010", capabilities: { SMS: true, voice: true }, beta: false, address_requirements: "none" }] }));
    const result = await searchTelephonyNumbers(NumberSearchSchema.parse({ profile, areaCode: "500", limit: 1 }), { apiBase, resolveToken: async () => "token" });
    expect(result.data).toEqual([{ phoneNumber: "+15005550010", friendlyName: "(500) 555-0010", capabilities: { SMS: true, voice: true } }]);
  });

  it("keeps provider execution disabled without an explicit test API base", async () => {
    const previous = process.env.VANTA_TELEPHONY_TEST_API_BASE; delete process.env.VANTA_TELEPHONY_TEST_API_BASE;
    try {
      const action = TelephonyActionSchema.parse({ ...common, id: "tel_sms_disabled", action: "sms", recipient: "+15005550009", consent: { source: "test", obtainedAt: "2026-07-11T10:00:00Z", expiresAt: "2099-07-12T00:00:00Z" }, statusCallbackUrl: "https://callbacks.example/twilio", body: "hello" });
      expect(await executeTelephonyAction(action, { resolveToken: async () => "token" })).toEqual({ ok: false, state: "test_adapter_unavailable" });
    } finally { if (previous !== undefined) process.env.VANTA_TELEPHONY_TEST_API_BASE = previous; }
  });

  it("rejects non-Twilio HTTPS overrides before resolving a credential", async () => {
    let resolved = false;
    const action = TelephonyActionSchema.parse({ ...common, id: "tel_sms_badhost1", action: "sms", recipient: "+15005550009", consent: { source: "test", obtainedAt: "2026-07-11T10:00:00Z", expiresAt: "2099-07-12T00:00:00Z" }, statusCallbackUrl: "https://callbacks.example/twilio", body: "hello" });
    expect(await executeTelephonyAction(action, { apiBase: "https://attacker.example", resolveToken: async () => { resolved = true; return "token"; } })).toEqual({ ok: false, state: "test_adapter_unavailable" });
    expect(resolved).toBe(false);
  });
});
