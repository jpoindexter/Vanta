import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveExecBackend, wrapExec } from "../exec/backend.js";
import { serverlessCliStatus, type ServerlessCliStatus } from "../exec/adapters/serverless.js";
import { resolveServerlessConfig, type ServerlessProvider } from "../exec/serverless.js";
import { buildRemoteProofScript, manifestFixture, parseRemoteProof, validateRemoteProof } from "../exec/backend-proof.js";
import { ensureKernel } from "../kernel-launcher.js";
import { kernelBinaryPath } from "../kernel/path.js";
import { createKernelClient } from "../kernel/client.js";
import type { Verdict } from "../types.js";

const exec = promisify(execFile);
const VERIFY_ACTION = "verify remote execution backend with a fixed read-only workspace probe";

type ProofRunner = (
  command: string,
  args: string[],
  options: { cwd: string; timeout: number; maxBuffer: number },
) => Promise<{ stdout: string; stderr: string }>;

type ProofInput = {
  root: string;
  env: NodeJS.ProcessEnv;
  provider: ServerlessProvider;
  manifest: { relativePath: string; sha256: string };
};

export type BackendCommandDeps = {
  log?: (line: string) => void;
  nonce?: () => string;
  assess?: (action: string) => Promise<Verdict>;
  wrap?: typeof wrapExec;
  run?: ProofRunner;
  readiness?: (provider: ServerlessProvider) => Promise<ServerlessCliStatus>;
};

async function runChild(command: string, args: string[], options: Parameters<ProofRunner>[2]) {
  const result = await exec(command, args, { ...options, encoding: "utf8" });
  return { stdout: String(result.stdout), stderr: String(result.stderr) };
}

async function assessProof(repoRoot: string, env: NodeJS.ProcessEnv): Promise<Verdict> {
  const baseUrl = env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788";
  await ensureKernel({ baseUrl, kernelBin: kernelBinaryPath(repoRoot), root: repoRoot });
  return createKernelClient(baseUrl).assess(VERIFY_ACTION);
}

async function status(env: NodeJS.ProcessEnv, deps: BackendCommandDeps, log: (line: string) => void): Promise<number> {
  const backend = resolveExecBackend(env);
  if (backend !== "serverless") {
    log(`execution backend: ${backend}`);
    return 0;
  }
  const resolved = resolveServerlessConfig(env);
  if (!resolved.ok) {
    log(`execution backend: serverless unavailable — ${resolved.reason}`);
    return 1;
  }
  const ready = await (deps.readiness ?? serverlessCliStatus)(resolved.config.provider);
  log(ready.ok
    ? `execution backend: serverless/${resolved.config.provider} ready`
    : `execution backend: serverless/${resolved.config.provider} unavailable — ${ready.reason}`);
  return ready.ok ? 0 : 1;
}

async function verify(repoRoot: string, env: NodeJS.ProcessEnv, deps: BackendCommandDeps, log: (line: string) => void): Promise<number> {
  const resolved = resolveServerlessConfig(env);
  if (resolveExecBackend(env) !== "serverless" || !resolved.ok) {
    log("backend verify requires VANTA_EXEC_BACKEND=serverless and VANTA_SERVERLESS_PROVIDER=modal|daytona");
    return 1;
  }
  const manifest = manifestFixture(repoRoot);
  if (!manifest) {
    log("backend verify could not find a safe metadata fixture in the workspace");
    return 1;
  }
  const verdict = await (deps.assess ?? (() => assessProof(repoRoot, env)))(VERIFY_ACTION);
  if (verdict.risk !== "allow") {
    log(`backend verify refused by kernel: ${verdict.risk} — ${verdict.reason}`);
    return 1;
  }
  return executeProof({ root: repoRoot, env, provider: resolved.config.provider, manifest }, deps, log);
}

async function executeProof(
  input: ProofInput,
  deps: BackendCommandDeps,
  log: (line: string) => void,
): Promise<number> {
  const { root, env, provider, manifest } = input;
  const nonce = (deps.nonce ?? randomUUID)();
  const wrapped = await (deps.wrap ?? wrapExec)({
    env, root, workdir: root, baseCmd: "node", baseArgs: ["-e", buildRemoteProofScript(nonce, manifest.relativePath)],
  });
  if ("error" in wrapped) {
    log(`backend verify failed: ${wrapped.error}`);
    return 1;
  }
  try {
    const result = await (deps.run ?? runChild)(wrapped.cmd, wrapped.args, { cwd: root, timeout: 600_000, maxBuffer: 4 * 1024 * 1024 });
    const proof = parseRemoteProof(`${result.stdout}\n${result.stderr}`);
    if (!proof) {
      log("backend verify failed: remote process returned no proof receipt");
      return 1;
    }
    const invalid = validateRemoteProof(proof, { nonce, manifestSha256: manifest.sha256, provider });
    if (invalid) {
      log(`backend verify failed: ${invalid}`);
      return 1;
    }
    log(`backend verify passed: ${provider} · ${proof.platform}/${proof.arch} · ${proof.cwd} · workspace hash matched · kernel allow`);
    return 0;
  } catch (error) {
    log(`backend verify failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    await wrapped.cleanup?.();
  }
}

export async function runBackendCommand(
  repoRoot: string,
  rest: string[],
  env: NodeJS.ProcessEnv = process.env,
  deps: BackendCommandDeps = {},
): Promise<number> {
  const log = deps.log ?? console.log;
  const command = rest[0] ?? "status";
  if (command === "status") return status(env, deps, log);
  if (command === "verify") return verify(repoRoot, env, deps, log);
  log("Usage: vanta backend [status|verify]");
  return 1;
}
