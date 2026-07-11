import { describe, expect, it } from "vitest";
import { callbackRank, parseTwilioCallback, twilioSignature, validateTwilioSignature } from "./callbacks.js";

describe("Twilio callbacks", () => {
  it("validates Twilio's sorted-parameter HMAC-SHA1 signature in constant-length comparison", () => {
    const url = "https://callbacks.example/twilio", params = { MessageStatus: "delivered", MessageSid: `SM${"a".repeat(32)}` }, token = "fixture-token";
    const signature = twilioSignature(url, params, token);
    expect(validateTwilioSignature(url, params, signature, token)).toBe(true);
    expect(validateTwilioSignature(url, params, `${signature}x`, token)).toBe(false);
  });

  it("matches Twilio's published request-signature test vector", () => {
    const url = "https://example.com/myapp.php?foo=1&bar=2";
    const params = { CallSid: "CA1234567890ABCDE", Caller: "+14158675310", Digits: "1234", From: "+14158675310", To: "+18005551212" };
    expect(twilioSignature(url, params, "12345")).toBe("L/OH5YylLD5NRKLltdqwSvS0BnU=");
  });

  it("parses message, call, and recording callbacks without retaining URLs", () => {
    expect(parseTwilioCallback({ MessageSid: `SM${"a".repeat(32)}`, MessageStatus: "delivered", ErrorCode: "0" })).toMatchObject({ kind: "message", status: "delivered" });
    expect(parseTwilioCallback({ CallSid: `CA${"b".repeat(32)}`, CallStatus: "completed", SequenceNumber: "4", CallDuration: "12" })).toMatchObject({ kind: "call", sequence: 4, durationSeconds: 12 });
    const recording = parseTwilioCallback({ CallSid: `CA${"b".repeat(32)}`, RecordingSid: `RE${"c".repeat(32)}`, RecordingStatus: "completed", RecordingUrl: "https://secret.example/audio" });
    expect(recording).toMatchObject({ kind: "recording", recordingSid: `RE${"c".repeat(32)}` }); expect(JSON.stringify(recording)).not.toContain("RecordingUrl");
  });

  it("ranks terminal states above earlier callbacks regardless of arrival order", () => {
    expect(callbackRank("completed")).toBeGreaterThan(callbackRank("ringing"));
    expect(callbackRank("delivered")).toBeGreaterThan(callbackRank("sent"));
  });
});
