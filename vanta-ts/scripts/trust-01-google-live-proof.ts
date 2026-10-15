import { createHash, randomUUID } from "node:crypto";
import { calendarCreateTool, calendarUpdateTool } from "../src/tools/calendar-write.js";
import { driveCreateTool, driveUpdateTool } from "../src/tools/drive-write.js";
import { gmailDraftTool, gmailSendTool } from "../src/tools/gmail.js";
import { googleFetch } from "../src/google/client.js";
import { hasGoogleAuth } from "../src/google/auth.js";
import type { ToolContext, ToolResult } from "../src/tools/types.js";

const CALENDAR_EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const GMAIL_PROFILE = "https://gmail.googleapis.com/gmail/v1/users/me/profile";

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function requireVerified(result: ToolResult, operation: string): void {
  if (!result.ok || result.effectDisposition !== "confirmed" || result.verification?.status !== "verified") {
    const httpStatus = result.output.match(/HTTP\s+\d{3}/)?.[0] ?? "no HTTP status";
    const failureClass = result.output.includes("acknowledgement mismatch")
      ? "acknowledgement-mismatch"
      : result.output.includes("readback mismatch")
        ? "readback-mismatch"
        : "other";
    const diagnostic = result.output.match(/\(content=(?:true|false), versionAdvanced=(?:true|false), versionAck=(?:true|false)\)/)?.[0]
      ?? "no field diagnostics";
    throw new Error(
      `${operation} did not return a verified confirmed settlement ` +
      `(ok=${result.ok}, disposition=${result.effectDisposition ?? "absent"}, class=${failureClass}, ${httpStatus}, ${diagnostic})`,
    );
  }
}

function idFromOutput(result: ToolResult, prefix: string): string {
  const value = result.output.slice(prefix.length).split(/\s/, 1)[0];
  if (!result.output.startsWith(prefix) || !value) throw new Error("provider acknowledgement omitted immutable id");
  return value;
}

function approvedContext(callId: string): ToolContext {
  return {
    root: process.cwd(),
    sessionId: "trust-01-live-proof",
    effectScopeId: "trust-01-live-proof",
    effectCallId: callId,
    safety: {} as ToolContext["safety"],
    requestApproval: async (action) => {
      if (!/^(create|update) (a calendar event|a drive file)$/.test(action)) {
        throw new Error(`unexpected approval action: ${action}`);
      }
      return true;
    },
  };
}

async function requireGmailAuthorityAndHeaderRefusal(): Promise<void> {
  const profile = await googleFetch(GMAIL_PROFILE, { method: "GET" });
  if (!profile.ok) throw new Error(`gmail authority refresh failed with HTTP ${profile.status}`);

  let approvals = 0;
  const refusalContext: ToolContext = {
    ...approvedContext("gmail-refusal"),
    requestApproval: async () => {
      approvals += 1;
      return true;
    },
  };
  const injection = { to: "safe@example.com\r\nBcc: hidden@example.com", subject: "proof", body: "redacted" };
  const [draft, send] = await Promise.all([
    gmailDraftTool.execute(injection, refusalContext),
    gmailSendTool.execute(injection, refusalContext),
  ]);
  if (draft.ok || send.ok || approvals !== 0) {
    throw new Error("gmail header injection reached approval or provider execution");
  }
}

async function proveCalendar(): Promise<{ created: boolean; updated: boolean; cleaned: boolean }> {
  const nonce = randomUUID();
  const callId = `calendar-${nonce}`;
  const context = approvedContext(callId);
  let eventId: string | undefined;
  let cleaned = false;
  let created = false;
  let updated = false;
  try {
    const createResult = await calendarCreateTool.execute({
      summary: `Vanta TRUST-01 proof ${nonce}`,
      description: digest(nonce),
      start: "2036-01-15T09:00:00Z",
      end: "2036-01-15T09:05:00Z",
    }, context);
    requireVerified(createResult, "calendar_create");
    created = true;
    eventId = idFromOutput(createResult, "created event ");

    const readback = await googleFetch(`${CALENDAR_EVENTS}/${encodeURIComponent(eventId)}`, { method: "GET" });
    if (!readback.ok) throw new Error(`calendar readback failed with HTTP ${readback.status}`);
    const event = await readback.json() as { id?: string; etag?: string };
    if (event.id !== eventId || !event.etag) throw new Error("calendar readback omitted immutable id or etag");

    const updateResult = await calendarUpdateTool.execute({
      id: eventId,
      etag: event.etag,
      summary: `Vanta TRUST-01 verified ${nonce}`,
    }, approvedContext(`calendar-update-${nonce}`));
    requireVerified(updateResult, "calendar_update");
    updated = true;
  } finally {
    if (eventId) {
      const deletion = await googleFetch(`${CALENDAR_EVENTS}/${encodeURIComponent(eventId)}`, { method: "DELETE" });
      cleaned = deletion.ok || deletion.status === 404;
      if (!cleaned) throw new Error(`calendar cleanup failed with HTTP ${deletion.status}`);
    }
  }
  return { created, updated, cleaned };
}

async function proveDrive(): Promise<{ created: boolean; updated: boolean; cleaned: boolean }> {
  const nonce = randomUUID();
  const original = digest(`original:${nonce}`);
  const replacement = digest(`replacement:${nonce}`);
  let fileId: string | undefined;
  let cleaned = false;
  let created = false;
  let updated = false;
  try {
    const createResult = await driveCreateTool.execute({
      name: `vanta-trust-01-${nonce}.txt`,
      content: original,
    }, approvedContext(`drive-${nonce}`));
    requireVerified(createResult, "drive_create");
    created = true;
    fileId = idFromOutput(createResult, "created drive file ");

    const metadata = await googleFetch(`${DRIVE_FILES}/${encodeURIComponent(fileId)}?fields=id,version`, { method: "GET" });
    if (!metadata.ok) throw new Error(`drive metadata readback failed with HTTP ${metadata.status}`);
    const file = await metadata.json() as { id?: string; version?: string };
    if (file.id !== fileId || !file.version) throw new Error("drive readback omitted immutable id or version");

    const updateResult = await driveUpdateTool.execute({
      id: fileId,
      version: file.version,
      content: replacement,
    }, approvedContext(`drive-update-${nonce}`));
    requireVerified(updateResult, "drive_update");
    updated = true;
  } finally {
    if (fileId) {
      const deletion = await googleFetch(`${DRIVE_FILES}/${encodeURIComponent(fileId)}`, { method: "DELETE" });
      cleaned = deletion.ok || deletion.status === 404;
      if (!cleaned) throw new Error(`drive cleanup failed with HTTP ${deletion.status}`);
    }
  }
  return { created, updated, cleaned };
}

async function main(): Promise<void> {
  const services = ["gmail", "calendar", "drive"] as const;
  const authority = await Promise.all(services.map(async (service) => [service, await hasGoogleAuth(process.env, service)] as const));
  const missing = authority.filter(([, authorized]) => !authorized).map(([service]) => service);
  if (missing.length > 0) throw new Error(`google authority is absent for: ${missing.join(", ")}`);
  await requireGmailAuthorityAndHeaderRefusal();
  const calendar = await proveCalendar();
  const drive = await proveDrive();
  console.log(JSON.stringify({
    ok: true,
    gmail: { authorized: true, headerInjectionRejectedBeforeApproval: true, sent: false },
    calendar,
    drive,
    persistedProviderContent: false,
  }));
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, error: (error as Error).message }));
  process.exitCode = 1;
});
