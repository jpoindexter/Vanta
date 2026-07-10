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

export async function serverlessCliAvailable(provider: ServerlessProvider): Promise<boolean> {
  try {
    await run(SERVERLESS_CLI[provider], ["--version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export function createServerlessExecAdapter(
  available: (provider: ServerlessProvider) => Promise<boolean> = serverlessCliAvailable,
): ExecBackendAdapter {
  return {
    id: "serverless",
    async wrap(args) {
      const resolved = resolveServerlessConfig(args.env);
      if (!resolved.ok) return { ok: false, reason: resolved.reason };
      if (!(await available(resolved.config.provider))) {
        return { ok: false, reason: `${SERVERLESS_CLI[resolved.config.provider]} CLI unavailable` };
      }
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
