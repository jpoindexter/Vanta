import { once } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { TelephonyProfileSchema } from "./schema.js";
import { startTelephonyIngress } from "./ingress.js";

const profile = TelephonyProfileSchema.parse({ version: 1, environment: "test", provider: "twilio", accountSid: `AC${"1".repeat(32)}`, authTokenVaultAlias: "TWILIO_TEST_TOKEN", from: "+15005550006", scopes: ["sms"] });

describe("telephony callback ingress", () => {
  it("accepts a bounded form and forwards the exact public URL and signature", async () => {
    const ingest = vi.fn(async () => ({ ok: true, state: "delivered" }));
    const server = startTelephonyIngress({ root: "/tmp", profile, publicUrl: "https://public.example/twilio", port: 7798, ingest });
    await once(server, "listening");
    try {
      const response = await fetch("http://127.0.0.1:7798/twilio", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": "signature" }, body: new URLSearchParams({ MessageSid: `SM${"a".repeat(32)}`, MessageStatus: "delivered" }) });
      expect(response.status).toBe(204);
      expect(ingest).toHaveBeenCalledWith(expect.objectContaining({ url: "https://public.example/twilio", signature: "signature", params: expect.objectContaining({ MessageStatus: "delivered" }) }));
    } finally { server.close(); await once(server, "close"); }
  });

  it("rejects wrong methods, content types, and failed authentication", async () => {
    const server = startTelephonyIngress({ root: "/tmp", profile, publicUrl: "https://public.example/twilio", port: 7797, ingest: async () => ({ ok: false, state: "invalid_signature" }) });
    await once(server, "listening");
    try {
      expect((await fetch("http://127.0.0.1:7797/twilio")).status).toBe(404);
      expect((await fetch("http://127.0.0.1:7797/twilio", { method: "POST", body: "x" })).status).toBe(415);
      expect((await fetch("http://127.0.0.1:7797/twilio", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "MessageStatus=sent" })).status).toBe(403);
    } finally { server.close(); await once(server, "close"); }
  });

  it("requires an HTTPS public URL ending in the fixed callback path", () => {
    expect(() => startTelephonyIngress({ root: "/tmp", profile, publicUrl: "http://public.example/twilio", port: 7796 })).toThrow("must be HTTPS");
    expect(() => startTelephonyIngress({ root: "/tmp", profile, publicUrl: "https://public.example/other", port: 7796 })).toThrow("must be HTTPS");
  });
});
