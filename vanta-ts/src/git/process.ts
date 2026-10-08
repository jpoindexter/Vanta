import { execFile, execFileSync, type ExecFileOptions, type ExecFileSyncOptions } from "node:child_process";
import { promisify } from "node:util";
import { gitCommandIndex, gitEnvironment, hardenedGitArgs } from "./policy.js";

const run = promisify(execFile);
export type GitProcessOptions = ExecFileOptions & {
  /** Explicit per-request credential; repository/global helpers are never inherited. */
  httpAuthorization?: { origin: string; header: string };
};

function processOptions(options: GitProcessOptions): ExecFileOptions {
  const { httpAuthorization: _authority, ...rest } = options;
  return { timeout: 15_000, maxBuffer: 1024 * 1024, ...rest, shell: false,
    encoding: "utf8", env: gitEnvironment(options.env) };
}

function configProbeArgs(args: readonly string[]): string[] {
  const i = gitCommandIndex(args);
  return hardenedGitArgs([...args.slice(0, i), "config", "--null", "--list"]);
}

function executionEnvironment(args: string[], options: GitProcessOptions): NodeJS.ProcessEnv {
  const env = gitEnvironment(options.env);
  const entries: string[] = [];
  for (let i = 0; i < args.length; i++) if (args[i] === "-c") entries.push(args[++i]!);
  const authority = options.httpAuthorization;
  if (authority) entries.push(authorizationEntry(authority));
  env.GIT_CONFIG_COUNT = String(entries.length);
  for (const [i, entry] of entries.entries()) {
    const equal = entry.indexOf("=");
    env[`GIT_CONFIG_KEY_${i}`] = entry.slice(0, equal);
    env[`GIT_CONFIG_VALUE_${i}`] = entry.slice(equal + 1);
  }
  return env;
}

function authorizationEntry(authority: NonNullable<GitProcessOptions["httpAuthorization"]>): string {
  const url = new URL(authority.origin);
  if (url.protocol !== "https:" || url.username || url.password || /[\r\n\0]/.test(authority.header)) {
    throw new Error("Git HTTP authority must bind a HTTPS origin and a single header");
  }
  return `http.${url.origin}/.extraHeader=${authority.header}`;
}

function commandArguments(args: string[], options: GitProcessOptions): string[] {
  if (!options.httpAuthorization) return args;
  const result: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-c" && /^http\..*extraheader=/i.test(args[i + 1] ?? "")) { i++; continue; }
    result.push(args[i]!);
  }
  return result;
}

/** Canonical noninteractive Git subprocess boundary. No repository execution sinks. */
export async function gitExecFile(file: string, args: readonly string[], options: GitProcessOptions = {}): Promise<{ stdout: string; stderr: string }> {
  if (file !== "git") throw new Error("Git process boundary accepts only git");
  const prepared = await prepareGitProcess(args, options);
  const result = await run("git", prepared.args, prepared.options);
  return { stdout: String(result.stdout), stderr: String(result.stderr) };
}

/** Preparation also lets the shell executor retain its original sandbox wrapper. */
export async function prepareGitProcess(args: readonly string[], options: GitProcessOptions = {}) {
  const opts = processOptions(options);
  const config = await run("git", configProbeArgs(args), opts);
  const argv = hardenedGitArgs(args, String(config.stdout));
  return { args: commandArguments(argv, options), options: { ...opts, env: executionEnvironment(argv, options) } };
}

/** Synchronous evidence readers use the same policy, rather than raw execFileSync. */
export function gitExecFileSync(file: string, args: readonly string[], options: GitProcessOptions = {}): string {
  if (file !== "git") throw new Error("Git process boundary accepts only git");
  const opts = processOptions(options) as ExecFileSyncOptions;
  const config = String(execFileSync("git", configProbeArgs(args), opts));
  const argv = hardenedGitArgs(args, config);
  return String(execFileSync("git", commandArguments(argv, options), { ...opts, env: executionEnvironment(argv, options) }));
}
