import { z } from "zod";
import { buildUrl } from "../google/client.js";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import {
  HeaderSchema,
  headerValue,
  encodeMime,
  PayloadSchema,
  extractPlainText,
  httpError,
  authError,
  OutboundArgs,
  IdResponse,
  googleFetch,
} from "./gmail-helpers.js";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

const SearchArgs = z.object({
  query: z.string().min(1),
  max: z.number().int().min(1).max(25).optional(),
});

const SearchListResponse = z
  .object({ messages: z.array(z.object({ id: z.string() }).passthrough()).optional() })
  .passthrough();

const MetadataResponse = z
  .object({
    snippet: z.string().optional(),
    payload: z.object({ headers: z.array(HeaderSchema).optional() }).passthrough().optional(),
  })
  .passthrough();

async function fetchMetadataLine(id: string): Promise<string> {
  const url = `${BASE}/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`;
  const res = await googleFetch(url, { method: "GET" });
  if (!res.ok) return `${id} | (failed: HTTP ${res.status})`;
  const meta = MetadataResponse.parse(await res.json());
  const headers = meta.payload?.headers ?? [];
  return `${id} | ${headerValue(headers, "From")} | ${headerValue(headers, "Subject")} | ${meta.snippet ?? ""}`;
}

export const gmailSearchTool: Tool = {
  schema: {
    name: "gmail_search",
    description: "Search the user's Gmail with a Gmail query string. Returns matching message ids with sender, subject, and snippet.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search query (e.g. from:alice is:unread)" },
        max: { type: "number", description: "Max results, 1-25 (default 10)" },
      },
      required: ["query"],
    },
  },
  describeForSafety: () => "search gmail",
  async execute(raw): Promise<ToolResult> {
    const parsed = SearchArgs.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'gmail_search needs a "query" string (max optional, 1-25)' };
    const { query, max } = parsed.data;
    try {
      const listUrl = buildUrl(`${BASE}/messages`, { q: query, maxResults: max ?? 10 });
      const listRes = await googleFetch(listUrl, { method: "GET" });
      if (!listRes.ok) return httpError(listRes);
      const list = SearchListResponse.parse(await listRes.json());
      const ids = (list.messages ?? []).map((m) => m.id);
      if (ids.length === 0) return { ok: true, output: "no messages matched" };
      const lines = await Promise.all(ids.map((id) => fetchMetadataLine(id)));
      return { ok: true, output: lines.join("\n") };
    } catch (err) {
      return authError(err);
    }
  },
};

const ReadArgs = z.object({ id: z.string().min(1) });
const FullMessageResponse = z
  .object({ payload: z.object({ headers: z.array(HeaderSchema).optional() }).passthrough().optional() })
  .passthrough();

export const gmailReadTool: Tool = {
  schema: {
    name: "gmail_read",
    description: "Read a single Gmail message by id. Returns its headers and plain-text body.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "The Gmail message id" } },
      required: ["id"],
    },
  },
  describeForSafety: () => "read a gmail message",
  async execute(raw): Promise<ToolResult> {
    const parsed = ReadArgs.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'gmail_read needs an "id" string' };
    try {
      const url = `${BASE}/messages/${encodeURIComponent(parsed.data.id)}?format=full`;
      const res = await googleFetch(url, { method: "GET" });
      if (!res.ok) return httpError(res);
      const json = await res.json();
      const msg = FullMessageResponse.parse(json);
      const headers = msg.payload?.headers ?? [];
      const payload = PayloadSchema.parse((json as { payload?: unknown }).payload ?? {});
      const text = extractPlainText(payload);
      const out = [
        `Subject: ${headerValue(headers, "Subject")}`,
        `From: ${headerValue(headers, "From")}`,
        `Date: ${headerValue(headers, "Date")}`,
        "",
        text,
      ].join("\n");
      return { ok: true, output: out };
    } catch (err) {
      return authError(err);
    }
  },
};

export const gmailDraftTool: Tool = {
  schema: {
    name: "gmail_draft",
    description: "Create a Gmail draft (does not send). Requires human approval.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject" },
        body: { type: "string", description: "Plain-text email body" },
      },
      required: ["to", "subject", "body"],
    },
  },
  describeForSafety: () => "create a gmail draft",
  async execute(raw, ctx: ToolContext): Promise<ToolResult> {
    const parsed = OutboundArgs.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'gmail_draft needs "to", "subject", and "body"' };
    const approved = await ctx.requestApproval("create a gmail draft", "creates a draft in your account");
    if (!approved) return { ok: false, output: "denied by user" };
    const { to, subject, body } = parsed.data;
    try {
      const raw64 = encodeMime(to, subject, body);
      const res = await googleFetch(`${BASE}/drafts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: { raw: raw64 } }),
      });
      if (!res.ok) return httpError(res);
      const out = IdResponse.parse(await res.json());
      return { ok: true, output: `draft created: ${out.id}` };
    } catch (err) {
      return authError(err);
    }
  },
};

export const gmailSendTool: Tool = {
  schema: {
    name: "gmail_send",
    description: "Send an email from the user's account. Irreversible. Requires human approval.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject" },
        body: { type: "string", description: "Plain-text email body" },
      },
      required: ["to", "subject", "body"],
    },
  },
  describeForSafety: () => "send an email",
  async execute(raw, ctx: ToolContext): Promise<ToolResult> {
    const parsed = OutboundArgs.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'gmail_send needs "to", "subject", and "body"' };
    const approved = await ctx.requestApproval("send an email", "sends mail from your account — irreversible");
    if (!approved) return { ok: false, output: "denied by user" };
    const { to, subject, body } = parsed.data;
    try {
      const raw64 = encodeMime(to, subject, body);
      const res = await googleFetch(`${BASE}/messages/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raw: raw64 }),
      });
      if (!res.ok) return httpError(res);
      const out = IdResponse.parse(await res.json());
      return { ok: true, output: `email sent: ${out.id}` };
    } catch (err) {
      return authError(err);
    }
  },
};
