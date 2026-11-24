import { runGoogleAuth } from "./auth.js";
import { isGoogleService, type GoogleService } from "./capability.js";

const USAGE = "Usage: vanta auth google [gmail|calendar|drive] [--client <client_secret.json>]";

/** Pull `--client <path>` out of the args; returns the path or undefined. */
export function parseClientFlag(args: string[]): string | undefined {
  const i = args.indexOf("--client");
  if (i === -1) return undefined;
  return args[i + 1];
}

function parseService(args: string[]): GoogleService | null {
  const candidate = args[1]?.startsWith("--") ? "gmail" : (args[1] ?? "gmail");
  return isGoogleService(candidate) ? candidate : null;
}

/**
 * `vanta auth google <service> [--client <path>]` — run one independently
 * revocable OAuth consent flow.
 * consent flow and persist the refresh token. `--client <path>` ingests Google's
 * downloaded client_secret.json (no client_id/secret copy-paste). On missing
 * creds or a bad file, print the actionable message and exit 1. Returns the
 * intended process exit code; never throws across the boundary.
 */
export async function runAuthCommand(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  if (args[0] !== "google") {
    console.log(USAGE);
    return 1;
  }
  const service = parseService(args);
  if (!service) {
    console.error("Google service must be gmail, calendar, or drive.");
    return 1;
  }
  const clientPath = parseClientFlag(args);
  if (args.includes("--client") && !clientPath) {
    console.error("--client needs a path to your downloaded client_secret.json");
    return 1;
  }
  try {
    await runGoogleAuth(env, { clientPath, service });
    console.log(
      `\nGoogle ${service} authorized. Vanta can now use ${service}_* tools.`,
    );
    return 0;
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
