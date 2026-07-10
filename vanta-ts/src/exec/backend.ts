import type { MaybeSandboxArgs, MaybeSandboxResult } from "../sandbox/run.js";
import { createDockerExecAdapter, dockerAvailable } from "./adapters/docker.js";
import { createLocalExecAdapter } from "./adapters/local.js";
import {
  createServerlessExecAdapter,
  serverlessCliStatus,
  type ServerlessCliStatus,
} from "./adapters/serverless.js";
import type { ExecBackend, ExecBackendAdapter } from "./backend-port.js";
import type { ServerlessProvider } from "./serverless.js";

export {
  buildDockerArgs,
  DEFAULT_DOCKER_IMAGE,
  dockerAvailable,
  dockerMounts,
} from "./adapters/docker.js";
export type { ExecBackend, ExecBackendAdapter, ExecBackendResult } from "./backend-port.js";

export type ExecDeps = {
  dockerAvailable?: () => Promise<boolean>;
  serverlessCliStatus?: (provider: ServerlessProvider) => Promise<ServerlessCliStatus>;
  adapters?: Partial<Record<ExecBackend, ExecBackendAdapter>>;
};

export function resolveExecBackend(env: NodeJS.ProcessEnv): ExecBackend {
  if (env.VANTA_EXEC_BACKEND === "docker") return "docker";
  if (env.VANTA_EXEC_BACKEND === "serverless") return "serverless";
  return "local";
}

/** The sole registration point for execution-location adapters. */
export function resolveExecBackendAdapter(
  env: NodeJS.ProcessEnv,
  deps: ExecDeps = {},
): { selected: ExecBackendAdapter; local: ExecBackendAdapter } {
  const local = deps.adapters?.local ?? createLocalExecAdapter();
  const registry: Record<ExecBackend, ExecBackendAdapter> = {
    local,
    docker: deps.adapters?.docker ?? createDockerExecAdapter(deps.dockerAvailable ?? dockerAvailable),
    serverless: deps.adapters?.serverless
      ?? createServerlessExecAdapter(deps.serverlessCliStatus ?? serverlessCliStatus),
  };
  return { selected: registry[resolveExecBackend(env)], local };
}

/** Docker preserves its historical local fallback; an explicit remote selection fails closed. */
export async function wrapExec(
  args: MaybeSandboxArgs,
  deps: ExecDeps = {},
): Promise<MaybeSandboxResult> {
  const { selected, local } = resolveExecBackendAdapter(args.env, deps);
  const result = await selected.wrap(args);
  if (result.ok) return result.invocation;
  if (selected.id === "serverless") {
    return {
      error:
        `remote execution backend unavailable: ${result.reason}. ` +
        `Refusing to run locally because VANTA_EXEC_BACKEND=serverless was explicit.`,
    };
  }
  const fallback = await local.wrap(args);
  if (!fallback.ok) throw new Error(`local execution adapter unavailable: ${fallback.reason}`);
  return fallback.invocation;
}
