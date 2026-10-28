import { z } from "zod";
import { getAccessToken } from "../google/auth.js";
import { loadTokens } from "../google/auth-store.js";
import { authError, buildGmailApproval, encodeMime, httpError, IdResponse, OutboundArgs } from "./gmail-helpers.js";
import type { ToolContext, ToolResult } from "./types.js";

const BASE = "https://gmail.googleapis.com/gmail/v1/users";
const Profile = z.object({ emailAddress: z.string().email() });
type Account = { env: NodeJS.ProcessEnv; refreshToken: string; accessToken: string; email: string };
const accountChanged = (): ToolResult => ({ ok: false, output: "Gmail account changed; review the connected account and request fresh approval", effectDisposition: "denied" });

async function sameAccount(account: Pick<Account, "env" | "refreshToken">): Promise<boolean> {
  return (await loadTokens(account.env, "gmail"))?.refresh_token === account.refreshToken;
}

async function prepareAccount(signal?: AbortSignal): Promise<Account> {
  signal?.throwIfAborted();
  const env = { ...process.env };
  const refreshToken = (await loadTokens(env, "gmail"))?.refresh_token;
  if (!refreshToken) throw new Error("Google gmail not authorized — run: vanta auth google gmail");
  const accessToken = await getAccessToken(env, undefined, "gmail");
  if (!await sameAccount({ env, refreshToken })) throw new Error(accountChanged().output);
  const response = await fetch(`${BASE}/me/profile`, { signal, headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Could not verify the Gmail sender (HTTP ${response.status}); no message was submitted`);
  const { emailAddress: email } = Profile.parse(await response.json());
  return { env, refreshToken, accessToken, email };
}

async function submissionFailure(response: Response): Promise<ToolResult> {
  if (response.status >= 500 || response.status === 408) {
    return { ok: false, output: `Gmail result is unknown (HTTP ${response.status}); inspect the mailbox before any retry`, effectDisposition: "unknown" };
  }
  return { ...await httpError(response), effectDisposition: "denied" };
}

export async function executeGmailOutbound(
  kind: "draft" | "send",
  message: z.infer<typeof OutboundArgs>,
  ctx: ToolContext,
): Promise<ToolResult> {
  let submitted = false;
  try {
    const account = await prepareAccount(ctx.signal);
    const approval = buildGmailApproval(kind, message, account.email);
    const approved = await ctx.requestApproval(approval.action, approval.reason, `gmail_${kind}`, approval.detail);
    if (!approved) return { ok: false, output: "denied by user", effectDisposition: "denied" };
    if (!await sameAccount(account)) return accountChanged();
    ctx.signal?.throwIfAborted();
    const raw = encodeMime(message.to, message.subject, message.body, account.email);
    submitted = true;
    // Freeze both credential and mailbox; never refresh/retry a consequential request.
    const response = await fetch(`${BASE}/${encodeURIComponent(account.email)}/${kind === "send" ? "messages/send" : "drafts"}`, {
      method: "POST",
      signal: ctx.signal,
      headers: { Authorization: `Bearer ${account.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify(kind === "send" ? { raw } : { message: { raw } }),
    });
    if (!response.ok) return submissionFailure(response);
    const out = IdResponse.parse(await response.json());
    return { ok: true, output: `${kind === "send" ? "email sent" : "draft created"}: ${out.id}`, effectDisposition: "confirmed", verification: { status: "unverified" } };
  } catch (error) {
    if (submitted) return { ok: false, output: "Gmail result is unknown; inspect the mailbox before any retry", effectDisposition: "unknown", verification: { status: "unverified" } };
    return { ...authError(error), effectDisposition: "denied" };
  }
}
