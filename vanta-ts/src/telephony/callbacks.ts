import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const MessageStatus = z.enum(["accepted", "scheduled", "queued", "sending", "sent", "delivered", "undelivered", "failed", "canceled", "read"]);
const CallStatus = z.enum(["queued", "initiated", "ringing", "in-progress", "completed", "busy", "failed", "no-answer", "canceled"]);
const RecordingStatus = z.enum(["in-progress", "completed", "absent"]);
export type TelephonyCallback = {
  kind: "message" | "call" | "recording"; providerId: string; status: string;
  sequence: number; accountSid?: string; errorCode?: string; durationSeconds?: number;
  recordingSid?: string; callSid?: string;
};

function signedPayload(url: string, params: Record<string, string>): string {
  return Object.keys(params).sort().reduce((value, key) => `${value}${key}${params[key]}`, url);
}

export function twilioSignature(url: string, params: Record<string, string>, authToken: string): string {
  return createHmac("sha1", authToken).update(signedPayload(url, params)).digest("base64");
}

export function validateTwilioSignature(url: string, params: Record<string, string>, signature: string, authToken: string): boolean {
  const expected = Buffer.from(twilioSignature(url, params, authToken)), received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function integer(value: string | undefined, fallback = 0): number {
  const parsed = Number(value); return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function parseTwilioCallback(params: Record<string, string>): TelephonyCallback | null {
  const message = z.object({ MessageSid: z.string().regex(/^SM[a-fA-F0-9]{32}$/), MessageStatus, AccountSid: z.string().optional(), ErrorCode: z.string().optional(), SequenceNumber: z.string().optional() }).passthrough().safeParse(params);
  if (message.success) return { kind: "message", providerId: message.data.MessageSid, status: message.data.MessageStatus, sequence: integer(message.data.SequenceNumber), accountSid: message.data.AccountSid, errorCode: message.data.ErrorCode };
  const recording = z.object({ RecordingSid: z.string().regex(/^RE[a-fA-F0-9]{32}$/), RecordingStatus, CallSid: z.string().regex(/^CA[a-fA-F0-9]{32}$/), AccountSid: z.string().optional(), RecordingDuration: z.string().optional(), SequenceNumber: z.string().optional() }).passthrough().safeParse(params);
  if (recording.success) return { kind: "recording", providerId: recording.data.CallSid, callSid: recording.data.CallSid, recordingSid: recording.data.RecordingSid, status: recording.data.RecordingStatus, sequence: integer(recording.data.SequenceNumber), accountSid: recording.data.AccountSid, durationSeconds: integer(recording.data.RecordingDuration, undefined) };
  const call = z.object({ CallSid: z.string().regex(/^CA[a-fA-F0-9]{32}$/), CallStatus, AccountSid: z.string().optional(), CallDuration: z.string().optional(), SequenceNumber: z.string().optional() }).passthrough().safeParse(params);
  return call.success ? { kind: "call", providerId: call.data.CallSid, callSid: call.data.CallSid, status: call.data.CallStatus, sequence: integer(call.data.SequenceNumber), accountSid: call.data.AccountSid, durationSeconds: integer(call.data.CallDuration, undefined) } : null;
}

const RANKS: Record<string, number> = {
  accepted: 1, scheduled: 1, queued: 2, sending: 3, initiated: 3, sent: 4, ringing: 4,
  "in-progress": 5, delivered: 6, read: 7, completed: 7, undelivered: 7, failed: 7,
  canceled: 7, busy: 7, "no-answer": 7, absent: 7,
};
export function callbackRank(status: string): number { return RANKS[status] ?? 0; }
