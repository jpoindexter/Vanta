import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { gmailDraftTool, gmailSendTool } from "./gmail.js";
import { getAccessToken } from "../google/auth.js";
import type { ToolContext } from "./types.js";

vi.mock("../google/auth.js", () => ({ getAccessToken: vi.fn(async () => "fixture-access") }));
vi.mock("../google/auth-store.js", () => ({ loadTokens: vi.fn(async () => ({ refresh_token: "fixture-refresh" })) }));
const message = { to: "recipient@example.invalid", subject: "Research brief", body: "Exact draft — café." };
const fetchSpy = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.clearAllMocks();
  fetchSpy.mockReset();
  fetchSpy.mockResolvedValueOnce(Response.json({ emailAddress: "sender@example.invalid" }));
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => { vi.unstubAllGlobals(); });

function context(approved = true): ToolContext {
  return {
    root: "/tmp/vanta-gmail-fixture",
    safety: undefined as unknown as ToolContext["safety"],
    requestApproval: vi.fn(async () => approved),
  };
}

it.each([gmailDraftTool, gmailSendTool])("$schema.name binds the preview, mailbox, MIME and token without another approval", async tool => {
  fetchSpy.mockResolvedValueOnce(Response.json({ id: "fixture-id" }));
  const ctx = context();
  const result = await tool.execute(message, ctx);
  expect(result).toMatchObject({ ok: true, effectDisposition: "confirmed", verification: { status: "unverified" } });
  expect(fetchSpy).toHaveBeenCalledTimes(2);
  const [url, init] = fetchSpy.mock.calls[1]!;
  expect(url).toBe(`https://gmail.googleapis.com/gmail/v1/users/sender%40example.invalid/${tool === gmailSendTool ? "messages/send" : "drafts"}`);
  expect(init).toMatchObject({ method: "POST", headers: { Authorization: "Bearer fixture-access" } });
  const sent = JSON.parse(init!.body as string);
  const mime = Buffer.from(sent.raw ?? sent.message.raw, "base64url").toString("utf8");
  expect(mime).toContain("From: sender@example.invalid\r\n");
  expect(mime).toContain(`To: ${message.to}\r\nSubject: ${message.subject}\r\n`);
  expect(mime.endsWith(message.body)).toBe(true);
  expect(ctx.requestApproval).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("from sender@example.invalid"), expect.any(String), tool.schema.name, { fresh: true, diff: expect.stringContaining(message.body) });
  expect(getAccessToken).toHaveBeenCalledOnce();
  expect(result.output).not.toContain(message.body);
});

it.each([401, 403, 500])("sender lookup HTTP %s stops before approval or submission", async status => {
  fetchSpy.mockReset().mockResolvedValueOnce(new Response("unavailable", { status }));
  const ctx = context();
  expect(await gmailSendTool.execute(message, ctx)).toMatchObject({ ok: false, effectDisposition: "denied" });
  expect(ctx.requestApproval).not.toHaveBeenCalled();
  expect(fetchSpy).toHaveBeenCalledOnce();
});

it("rejects malformed sender identity before approval or submission", async () => {
  fetchSpy.mockReset().mockResolvedValueOnce(Response.json({ emailAddress: "sender\r\nBcc: elsewhere" }));
  const ctx = context();
  expect(await gmailSendTool.execute(message, ctx)).toMatchObject({ ok: false, effectDisposition: "denied" });
  expect(ctx.requestApproval).not.toHaveBeenCalled();
  expect(fetchSpy).toHaveBeenCalledOnce();
});

it.each([400, 401, 403])("submission HTTP %s is denied without refreshing or retrying", async status => {
  fetchSpy.mockResolvedValueOnce(new Response("rejected", { status }));
  expect(await gmailSendTool.execute(message, context())).toMatchObject({ ok: false, effectDisposition: "denied" });
  expect(fetchSpy).toHaveBeenCalledTimes(2);
  expect(getAccessToken).toHaveBeenCalledOnce();
});

it.each([408, 500, 503])("submission HTTP %s is unknown and not retried", async status => {
  fetchSpy.mockResolvedValueOnce(new Response("uncertain", { status }));
  const result = await gmailSendTool.execute(message, context());
  expect(result).toMatchObject({ ok: false, effectDisposition: "unknown" });
  expect(result.output).toContain("inspect the mailbox");
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

it("a reset after submission is unknown and not retried", async () => {
  fetchSpy.mockRejectedValueOnce(new Error("reset"));
  const result = await gmailSendTool.execute(message, context());
  expect(result).toMatchObject({ ok: false, effectDisposition: "unknown" });
  expect(result.output).toContain("before any retry");
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

it.each([{}, { id: "" }])("an acknowledgement without a usable id stays unknown", async acknowledgement => {
  fetchSpy.mockResolvedValueOnce(Response.json(acknowledgement));
  expect(await gmailSendTool.execute(message, context())).toMatchObject({ ok: false, effectDisposition: "unknown" });
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});
