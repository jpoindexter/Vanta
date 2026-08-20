import { linkedInStatus, runLinkedInAuth } from "./oauth.js";

const USAGE = "Usage: vanta auth linkedin [status] [--client-id <client-id>]";

interface CommandDeps {
  connect?: typeof runLinkedInAuth;
  status?: typeof linkedInStatus;
  log?: (message: string) => void;
  error?: (message: string) => void;
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function reportStatus(
  env: NodeJS.ProcessEnv,
  deps: CommandDeps,
  log: (message: string) => void,
): Promise<number> {
  const result = await (deps.status ?? linkedInStatus)(env);
  if (!result.credential) {
    log("LinkedIn is not connected. Run: vanta auth linkedin --client-id <client-id>");
    return 1;
  }
  if (result.expired) {
    log("LinkedIn authorization expired. Run: vanta auth linkedin");
    return 1;
  }
  log(`LinkedIn connected as ${result.credential.name ?? "your personal account"}; expires ${new Date(result.credential.expiresAt).toISOString()}.`);
  return 0;
}

async function connect(input: {
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
    const identity = await (input.deps.connect ?? runLinkedInAuth)(input.env, { clientId, notify: input.log });
    input.log(`LinkedIn connected as ${identity.name ?? "your personal account"}. Personal posting authority is available only through w_member_social.`);
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
  const action = args[1]?.startsWith("--") ? "connect" : (args[1] ?? "connect");
  if (action === "status") return reportStatus(env, deps, log);
  if (action !== "connect") {
    error(USAGE);
    return 1;
  }
  return connect({ args, env, deps, log, error });
}
