import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { resolve } from "node:path";
import type { ExecBackendAdapter } from "../backend-port.js";
import {
  buildServerlessArgs,
  resolveServerlessConfig,
  SERVERLESS_CLI,
  type ServerlessProvider,
} from "../serverless.js";

const run = promisify(execFile);
const MODAL_HELPER = fileURLToPath(new URL("./modal-sandbox.py", import.meta.url));

export type ServerlessCliStatus = { ok: true } | { ok: false; reason: string };
export type ServerlessCliRunner = (
  command: string,
  args: string[],
  options: { timeout: number },
) => Promise<unknown>;

export async function serverlessCliStatus(
  provider: ServerlessProvider,
  exec: ServerlessCliRunner = run,
): Promise<ServerlessCliStatus> {
  const cli = SERVERLESS_CLI[provider];
  try {
    await exec(cli, ["--version"], { timeout: 5000 });
  } catch {
    return { ok: false, reason: `${cli} CLI unavailable` };
  }
  if (provider !== "modal") return { ok: true };
  try {
    await exec(cli, ["token", "info"], { timeout: 5000 });
    return { ok: true };
  } catch {
    return {
      ok: false,
      reason: "Modal CLI is installed but not authenticated; run `modal token new --verify`",
    };
  }
}

export function createServerlessExecAdapter(
  status: (provider: ServerlessProvider) => Promise<ServerlessCliStatus> = serverlessCliStatus,
): ExecBackendAdapter {
  return {
    id: "serverless",
    async wrap(args) {
      const resolved = resolveServerlessConfig(args.env);
      if (!resolved.ok) return { ok: false, reason: resolved.reason };
      const readiness = await status(resolved.config.provider);
      if (!readiness.ok) return readiness;
      return {
        ok: true,
        invocation: {
          cmd: SERVERLESS_CLI[resolved.config.provider],
          args: buildServerlessArgs(
            [args.baseCmd, ...args.baseArgs],
            resolved.config,
            { root: resolve(args.workdir ?? args.root), modalHelper: MODAL_HELPER },
          ),
        },
      };
    },
  };
}
