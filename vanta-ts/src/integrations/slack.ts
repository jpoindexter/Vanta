import { z } from "zod";

export type SlackFetch = typeof fetch;

const AuthSchema = z.object({ ok: z.boolean(), error: z.string().optional() });

export async function testSlack(
  env: NodeJS.ProcessEnv = process.env,
  fetcher: SlackFetch = fetch,
): Promise<void> {
  const token = env.VANTA_SLACK_BOT_TOKEN?.trim();
  if (!token) throw new Error("Slack needs VANTA_SLACK_BOT_TOKEN before it can be tested.");
  const base = (env.VANTA_SLACK_API_BASE?.trim() || "https://slack.com/api").replace(/\/$/, "");
  const response = await fetcher(`${base}/auth.test`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
  const body = AuthSchema.safeParse(await response.json());
  if (!response.ok || !body.success || !body.data.ok) throw slackError(response.status, body.success ? body.data.error : undefined);
}

function slackError(status: number, reason?: string): Error {
  if (status === 401 || status === 403 || reason === "invalid_auth") return new Error("Slack rejected the bot token. Reinstall or replace the bot credential.");
  if (status === 429) return new Error("Slack rate limit reached. Wait before retrying.");
  return new Error(`Slack verification failed${reason ? ` (${reason})` : ""} with HTTP ${status}.`);
}
