import { execFile } from "node:child_process";
import {
  beginGoogleKernelAuth,
  completeGoogleKernelAuth,
} from "../google/kernel-auth.js";
import type { Tool, ToolContext, ToolResult } from "./types.js";

/** Best-effort open of the consent page in the user's default browser. A plain
 *  spawn (no IPC pipe), so it survives the sandbox that blocks tsx's pipe. */
function openBrowser(url: string): Promise<boolean> {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : ["xdg-open", [url]];
  return new Promise((resolve) => {
    execFile(cmd as string, args as string[], (err) => resolve(!err));
  });
}

async function startAuth(env: NodeJS.ProcessEnv): Promise<ToolResult> {
  const { authUrl } = await beginGoogleKernelAuth(env);
  const opened = await openBrowser(authUrl);
  return {
    ok: true,
    output:
      (opened ? "Opened the Google consent page in your browser.\n\n" : "") +
      `Authorize Vanta with Google at this URL:\n\n${authUrl}\n\n` +
      `Then call google_auth with action='complete' to finish.`,
  };
}

async function completeAuth(env: NodeJS.ProcessEnv): Promise<ToolResult> {
  await completeGoogleKernelAuth(env);
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
