import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { commandExists } from "../setup/preflight.js";

const exec = promisify(execFile);

export type BuzzReadiness = {
  ok: boolean;
  missing: string[];
  relayUrl: string;
};

function displayRelayUrl(env: NodeJS.ProcessEnv): string {
  const raw = env.BUZZ_RELAY_URL?.trim() || "ws://localhost:3000";
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return env.BUZZ_RELAY_URL ? "(configured relay)" : raw;
  }
}

export function buzzReadiness(
  env: NodeJS.ProcessEnv = process.env,
  hasCommand: (command: string) => boolean = commandExists,
): BuzzReadiness {
  const missing = [
    ...(!hasCommand("buzz-acp") ? ["buzz-acp"] : []),
    ...(!hasCommand("buzz") ? ["buzz"] : []),
    ...(!env.BUZZ_PRIVATE_KEY?.trim() ? ["BUZZ_PRIVATE_KEY"] : []),
  ];
  return {
    ok: missing.length === 0,
    missing,
    relayUrl: displayRelayUrl(env),
  };
}

export function buildBuzzHarnessEnv(
  env: NodeJS.ProcessEnv,
  agentCommand: string,
): NodeJS.ProcessEnv {
  return {
    ...env,
    BUZZ_ACP_AGENT_COMMAND: agentCommand,
    BUZZ_ACP_AGENT_ARGS: "acp,serve",
  };
}

export function formatBuzzSetup(env: NodeJS.ProcessEnv, agentCommand: string): string {
  const relay = displayRelayUrl(env);
  const relayLine = env.BUZZ_RELAY_URL?.trim()
    ? `# BUZZ_RELAY_URL already configured (${relay})`
    : `export BUZZ_RELAY_URL=${JSON.stringify(relay)}`;
  return [
    "Buzz runs Vanta through its ACP harness:",
    'export BUZZ_PRIVATE_KEY="nsec1..."',
    relayLine,
    `export BUZZ_ACP_AGENT_COMMAND=${JSON.stringify(agentCommand)}`,
    'export BUZZ_ACP_AGENT_ARGS="acp,serve"',
    "vanta buzz serve",
    "",
    "Build missing Buzz binaries from block/buzz:",
    "cargo build --release -p buzz-acp -p buzz-cli",
    'export PATH="$PWD/target/release:$PATH"',
  ].join("\n");
}

export async function testBuzzConnection(
  env: NodeJS.ProcessEnv = process.env,
  hasCommand: (command: string) => boolean = commandExists,
): Promise<void> {
  const readiness = buzzReadiness(env, hasCommand);
  if (!readiness.ok) throw new Error(`Buzz setup incomplete: missing ${readiness.missing.join(", ")}`);
  try {
    await exec("buzz", ["channels", "list"], {
      env,
      timeout: 15_000,
      maxBuffer: 2 * 1024 * 1024,
    });
  } catch (error) {
    let detail = error instanceof Error ? (error.message.split("\n")[0] ?? error.message) : String(error);
    for (const secret of [env.BUZZ_PRIVATE_KEY, env.BUZZ_API_TOKEN, env.BUZZ_AUTH_TAG]) {
      if (secret) detail = detail.replaceAll(secret, "[redacted]");
    }
    const rawRelay = env.BUZZ_RELAY_URL?.trim();
    if (rawRelay) detail = detail.replaceAll(rawRelay, displayRelayUrl(env));
    throw new Error(`Buzz relay verification failed: ${detail}`);
  }
}
