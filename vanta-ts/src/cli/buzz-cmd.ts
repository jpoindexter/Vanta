import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { commandExists } from "../setup/preflight.js";
import {
  buildBuzzHarnessEnv,
  buzzReadiness,
  formatBuzzSetup,
  testBuzzConnection,
} from "../integrations/buzz.js";

type BuzzDeps = {
  env?: NodeJS.ProcessEnv;
  hasCommand?: (command: string) => boolean;
  log?: (message: string) => void;
  error?: (message: string) => void;
  runHarness?: (root: string, env: NodeJS.ProcessEnv) => Promise<number>;
  probe?: (env: NodeJS.ProcessEnv, has: (command: string) => boolean) => Promise<void>;
  agentCommand?: string;
};

function defaultAgentCommand(env: NodeJS.ProcessEnv): string {
  if (env.VANTA_BUZZ_AGENT_COMMAND?.trim()) return env.VANTA_BUZZ_AGENT_COMMAND.trim();
  const installed = join(homedir(), ".local", "bin", "vanta");
  return existsSync(installed) ? installed : "vanta";
}

async function runHarness(root: string, env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("buzz-acp", [], { cwd: root, env, stdio: "inherit" });
    child.once("error", (error) => {
      process.stderr.write(`vanta buzz: ${error.message}\n`);
      resolve(1);
    });
    child.once("exit", (code, signal) => resolve(signal ? 130 : (code ?? 1)));
  });
}

type BuzzContext = {
  root: string;
  env: NodeJS.ProcessEnv;
  has: (command: string) => boolean;
  log: (message: string) => void;
  error: (message: string) => void;
  agentCommand: string;
  deps: BuzzDeps;
};

async function runBuzzTest(ctx: BuzzContext): Promise<number> {
  try {
    await (ctx.deps.probe ?? testBuzzConnection)(ctx.env, ctx.has);
    ctx.log(`Buzz relay connection verified · ${buzzReadiness(ctx.env, ctx.has).relayUrl}`);
    return 0;
  } catch (cause) {
    ctx.error(cause instanceof Error ? cause.message : String(cause));
    return 1;
  }
}

async function runBuzzServe(ctx: BuzzContext): Promise<number> {
  const readiness = buzzReadiness(ctx.env, ctx.has);
  if (!readiness.ok) {
    ctx.error(`Buzz setup incomplete: missing ${readiness.missing.join(", ")}\nRun: vanta buzz configure`);
    return 1;
  }
  ctx.log(`Connecting Vanta to Buzz · ${readiness.relayUrl}`);
  const childEnv = buildBuzzHarnessEnv(ctx.env, ctx.agentCommand);
  return (ctx.deps.runHarness ?? runHarness)(ctx.root, childEnv);
}

function buildContext(root: string, deps: BuzzDeps): BuzzContext {
  const env = deps.env ?? process.env;
  const has = deps.hasCommand ?? commandExists;
  return {
    root,
    env,
    has,
    log: deps.log ?? console.log,
    error: deps.error ?? console.error,
    agentCommand: deps.agentCommand ?? defaultAgentCommand(env),
    deps,
  };
}

export async function runBuzzCommand(root: string, args: string[], deps: BuzzDeps = {}): Promise<number> {
  const ctx = buildContext(root, deps);
  const action = args[0] ?? "status";
  if (action === "configure" || action === "config") ctx.log(formatBuzzSetup(ctx.env, ctx.agentCommand));
  else if (action === "status") {
    const readiness = buzzReadiness(ctx.env, ctx.has);
    ctx.log(readiness.ok
      ? `Buzz ready locally · relay ${readiness.relayUrl}`
      : `Buzz needs setup · missing ${readiness.missing.join(", ")}`);
    return readiness.ok ? 0 : 1;
  }
  else if (action === "test") return runBuzzTest(ctx);
  else if (action === "serve" || action === "connect") return runBuzzServe(ctx);
  else {
    ctx.error("usage: vanta buzz [status|configure|test|serve]");
    return 1;
  }
  return 0;
}

export { buildBuzzHarnessEnv, buzzReadiness, formatBuzzSetup };
