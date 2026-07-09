export const DEFAULT_DESKTOP_PORT = 7790;

export type DesktopLaunchPlan = {
  port: number;
  url: string;
  openBrowser: boolean;
};

export type NativeShellPlan = DesktopLaunchPlan & {
  smoke: boolean;
  devtools: boolean;
  nodeBin: string;
};

function parsePort(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DESKTOP_PORT;
}

export function desktopUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

export function parseDesktopLaunchArgs(args: string[], env: NodeJS.ProcessEnv = process.env): DesktopLaunchPlan {
  const portArg = args.find((arg) => /^\d+$/.test(arg));
  const port = parsePort(portArg ?? env.VANTA_DESKTOP_PORT);
  return {
    port,
    url: desktopUrl(port),
    openBrowser: !args.includes("--no-open"),
  };
}

export function parseNativeShellArgs(args: string[], env: NodeJS.ProcessEnv = process.env): NativeShellPlan {
  const base = parseDesktopLaunchArgs(args, env);
  return {
    ...base,
    smoke: args.includes("--smoke"),
    devtools: args.includes("--devtools"),
    nodeBin: env.VANTA_NODE || "node",
  };
}

export function desktopServerArgs(plan: DesktopLaunchPlan): string[] {
  return ["--import", "tsx", "src/cli.ts", "desktop", String(plan.port), "--no-open"];
}
