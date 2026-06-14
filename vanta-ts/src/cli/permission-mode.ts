export type PermissionModeParse = {
  rest: string[];
  env: NodeJS.ProcessEnv;
  error?: string;
};

function envForMode(mode: string | undefined): NodeJS.ProcessEnv {
  if (mode === "auto") return { VANTA_AUTO_MODE: "1" };
  if (mode === "default" || mode === "normal" || mode === "manual") return { VANTA_AUTO_MODE: "0" };
  return {};
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
    if (next.VANTA_AUTO_MODE === undefined) error = `unsupported permission mode: ${mode ?? "(missing)"}`;
    else env.VANTA_AUTO_MODE = next.VANTA_AUTO_MODE;
  }
  return { rest, env, error };
}
