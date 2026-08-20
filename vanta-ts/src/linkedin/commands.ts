import { createInterface } from "node:readline/promises";
import { promptSecret } from "../setup.js";
import { LINKEDIN_TOKEN_GENERATOR_URL } from "./contract.js";
import { importLinkedInToken, linkedInStatus, runLinkedInAuth } from "./oauth.js";

const USAGE = "Usage: vanta auth linkedin [status|import|native-pkce] [--client-id <client-id>]";

interface CommandDeps {
  connect?: typeof runLinkedInAuth;
  importToken?: typeof importLinkedInToken;
  status?: typeof linkedInStatus;
  askSecret?: (query: string) => Promise<string>;
  log?: (message: string) => void;
  error?: (message: string) => void;
}

async function askHidden(query: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await promptSecret(rl, query);
  } finally {
    rl.close();
  }
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function clientIdForImport(
  args: string[],
  env: NodeJS.ProcessEnv,
): { clientId?: string; issue?: string } {
  const explicitClientId = valueAfter(args, "--client-id")?.trim();
  if (args.includes("--client-id") && !explicitClientId) {
    return { issue: "--client-id needs the Client ID shown on LinkedIn's Auth tab." };
  }
  const clientId = explicitClientId || env.VANTA_LINKEDIN_CLIENT_ID?.trim();
  return clientId
    ? { clientId }
    : { issue: "LinkedIn client ID missing. Run with --client-id from the app's Auth tab." };
}

async function reportStatus(
  env: NodeJS.ProcessEnv,
  deps: CommandDeps,
  log: (message: string) => void,
): Promise<number> {
  const result = await (deps.status ?? linkedInStatus)(env);
  if (!result.credential) {
    log("LinkedIn is not connected. Run: vanta auth linkedin import --client-id <client-id>");
    return 1;
  }
  if (result.expired) {
    log("LinkedIn authorization expired. Run: vanta auth linkedin import");
    return 1;
  }
  log(`LinkedIn personal posting authority is connected; expires ${new Date(result.credential.expiresAt).toISOString()}.`);
  return 0;
}

async function connectNative(input: {
  args: string[];
  env: NodeJS.ProcessEnv;
  deps: CommandDeps;
  log: (message: string) => void;
  error: (message: string) => void;
}): Promise<number> {
  const clientId = valueAfter(input.args, "--client-id");
  if (input.args.includes("--client-id") && !clientId) {
    input.error("--client-id needs the Client ID shown on LinkedIn's Auth tab.");
    return 1;
  }
  try {
    await (input.deps.connect ?? runLinkedInAuth)(input.env, { clientId, notify: input.log });
    input.log("LinkedIn personal posting authority is connected through w_member_social.");
    return 0;
  } catch (caught) {
    input.error(caught instanceof Error ? caught.message : String(caught));
    return 1;
  }
}

async function importPortalToken(input: {
  args: string[];
  env: NodeJS.ProcessEnv;
  deps: CommandDeps;
  log: (message: string) => void;
  error: (message: string) => void;
}): Promise<number> {
  const resolved = clientIdForImport(input.args, input.env);
  if (!resolved.clientId) {
    input.error(resolved.issue ?? "LinkedIn client ID missing.");
    return 1;
  }
  const ask = input.deps.askSecret ?? askHidden;
  input.log(`Generate a w_member_social token in LinkedIn's official tool:\n${LINKEDIN_TOKEN_GENERATOR_URL}`);
  const accessToken = await ask("Paste the generated LinkedIn access token (hidden): ");
  const clientSecret = await ask("Paste the LinkedIn client secret for one-time verification (hidden; never stored): ");
  if (!accessToken || !clientSecret) {
    input.error("Token and client secret are required; nothing was stored.");
    return 1;
  }
  try {
    await (input.deps.importToken ?? importLinkedInToken)(input.env, {
      accessToken,
      clientId: resolved.clientId,
      clientSecret,
    });
    input.log("LinkedIn personal posting authority verified and stored securely.");
    return 0;
  } catch (caught) {
    input.error(caught instanceof Error ? caught.message : String(caught));
    return 1;
  }
}

export async function runLinkedInAuthCommand(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  deps: CommandDeps = {},
): Promise<number> {
  const log = deps.log ?? console.log;
  const error = deps.error ?? console.error;
  if (args[0] !== "linkedin") {
    log(USAGE);
    return 1;
  }
  const action = args[1]?.startsWith("--") ? "import" : (args[1] ?? "import");
  if (action === "status") return reportStatus(env, deps, log);
  if (action === "import") return importPortalToken({ args, env, deps, log, error });
  if (action !== "native-pkce") {
    error(USAGE);
    return 1;
  }
  return connectNative({ args, env, deps, log, error });
}
