import { envForPermissionMode, parsePermissionMode } from "../modes/permission-mode.js";

export type PermissionModeParse = {
  rest: string[];
  env: NodeJS.ProcessEnv;
  error?: string;
};

function envForMode(mode: string | undefined): NodeJS.ProcessEnv {
  const parsed = parsePermissionMode(mode);
  return parsed ? envForPermissionMode(parsed) : {};
}

export function parsePermissionModeFlags(args: string[], baseEnv: NodeJS.ProcessEnv): PermissionModeParse {
  const rest: string[] = [];
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  let error: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    let mode: string | undefined;
    if (arg === "--permission-mode") {
      mode = args[++i];
    } else if (arg.startsWith("--permission-mode=")) {
      mode = arg.slice("--permission-mode=".length);
    } else {
      rest.push(arg);
      continue;
    }
    const next = envForMode(mode);
    if (next.VANTA_PERMISSION_MODE === undefined) error = `unsupported permission mode: ${mode ?? "(missing)"}`;
    else Object.assign(env, next);
  }
  return { rest, env, error };
}
