import {
  resolveClientCreds,
  buildClient,
  readApiToken,
  pollKernelForCode,
} from "../google/auth.js";
import { parseTokenFile, saveTokens } from "../google/auth-store.js";
import type { Tool, ToolContext, ToolResult } from "./types.js";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive",
];

function kernelBase(): string {
  return (process.env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788").replace(/\/$/, "");
}

async function startAuth(env: NodeJS.ProcessEnv): Promise<ToolResult> {
  const creds = await resolveClientCreds(undefined, env);
  const redirectUri = `${kernelBase()}/oauth/callback`;
  const client = await buildClient(redirectUri, creds);
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    redirect_uri: redirectUri,
  });
  return {
    ok: true,
    output:
      `Open this URL in your browser to authorize Vanta with Google:\n\n${authUrl}\n\n` +
      `After approving, call google_auth with action='complete' to finish.`,
  };
}

async function completeAuth(env: NodeJS.ProcessEnv): Promise<ToolResult> {
  const apiToken = await readApiToken(env);
  if (!apiToken) {
    return { ok: false, output: "Kernel API token not found — run `vanta doctor` to check kernel health." };
  }
  const code = await pollKernelForCode(kernelBase(), apiToken);
  const creds = await resolveClientCreds(undefined, env);
  const client = await buildClient(`${kernelBase()}/oauth/callback`, creds);
  const { tokens } = await client.getToken(code);
  const parsed = parseTokenFile(tokens as unknown);
  if (!parsed?.refresh_token) {
    return {
      ok: false,
      output:
        "Google did not return a refresh_token. Revoke Vanta's access at " +
        "myaccount.google.com/permissions then call google_auth start again.",
    };
  }
  await saveTokens(parsed, env);
  return { ok: true, output: "Google authorization complete. Tokens saved to ~/.vanta/google-tokens.json." };
}

export const googleAuthTool: Tool = {
  schema: {
    name: "google_auth",
    description:
      "Authorize Vanta with Google. Two steps: " +
      "1) Call with action='start' — returns the consent URL; show it to the user. " +
      "2) Call with action='complete' — waits (up to 5 min) for the user to approve in " +
      "their browser, then saves the tokens. Use when the user says 'auth google' or " +
      "'vanta auth google'. Do NOT shell out to ./run.sh auth google.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["start", "complete"],
          description: "'start' returns the consent URL. 'complete' polls for the callback and saves tokens.",
        },
      },
      required: ["action"],
    },
  },
  describeForSafety: () => "google oauth: open browser consent screen",
  execute: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> => {
    const env = process.env;
    try {
      if (args.action === "start") return await startAuth(env);
      if (args.action === "complete") return await completeAuth(env);
      return { ok: false, output: `Unknown action '${String(args.action)}'. Use 'start' or 'complete'.` };
    } catch (err) {
      return { ok: false, output: err instanceof Error ? err.message : String(err) };
    }
  },
};
