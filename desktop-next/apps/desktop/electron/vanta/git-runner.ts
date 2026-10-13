import { spawn as nodeSpawn } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * The only way the shell runs git. The renderer never supplies argv: the read modules build it from typed
 * values, and `validateGitArgs` re-checks every call against a per-subcommand allowlist. There is no way to
 * name `-c`, `--output`, `--no-index`, an external diff, a pager, a hook or any subcommand that writes.
 */

export const GIT_TIMEOUT_MS = 15_000;
export const GIT_OUTPUT_CAP = 4 * 1024 * 1024;
const STDERR_CAP = 8 * 1024;
const MAX_ARG_LENGTH = 4096;
const MAX_LOG_COUNT = 1000;

/** A ref, sha or revision expression with no whitespace, option dash, colon (`rev:path`) or glob. */
export const SAFE_REF = /^(?!-)[A-Za-z0-9._/@+~^{}-]{1,200}$/;

const COMMON_DIFF_FLAGS = ["--no-ext-diff", "--no-textconv", "--no-color", "-M", "-z", "--numstat", "--cached", "--name-only"];

interface Policy {
  flags: ReadonlySet<string>;
  /** Bare words that are allowed before `--`: ref names, or a fixed subcommand word. */
  positional: "none" | "refs" | { word: string };
}

const POLICIES: Record<string, Policy> = {
  "check-ignore": { flags: new Set(), positional: "none" },
  branch: {
    flags: new Set(["--list", "--all", "--format=%(refname)%09%(HEAD)%09%(worktreepath)"]),
    positional: "none"
  },
  diff: { flags: new Set([...COMMON_DIFF_FLAGS, "--stat", "--unified=3"]), positional: "refs" },
  log: { flags: new Set(["-n", "--no-color", "--format=%H%x1f%s"]), positional: "refs" },
  "ls-files": { flags: new Set(["-z", "--cached", "--others", "--exclude-standard", "--ignored"]), positional: "none" },
  "merge-base": { flags: new Set(), positional: "refs" },
  "rev-parse": { flags: new Set(["--verify", "--quiet", "--abbrev-ref", "--is-inside-work-tree"]), positional: "refs" },
  status: {
    flags: new Set(["--porcelain=v2", "--branch", "-z", "--untracked-files=normal"]),
    positional: "none"
  },
  worktree: { flags: new Set(["--porcelain"]), positional: { word: "list" } }
};

export const ALLOWED_SUBCOMMANDS: readonly string[] = Object.keys(POLICIES);

export const safeRepoPath = (value: string): boolean =>
  value.length > 0 && value.length <= MAX_ARG_LENGTH && !value.includes("\0") && !value.startsWith(":");

function checkFlag(policy: Policy, args: readonly string[], index: number): { next: number } | string {
  const flag = args[index] as string;

  if (flag === "-n" && policy.flags.has("-n")) {
    const count = args[index + 1] ?? "";

    return /^\d{1,4}$/.test(count) && Number(count) <= MAX_LOG_COUNT ? { next: index + 2 } : "log -n needs a count up to 1000";
  }

  return policy.flags.has(flag) ? { next: index + 1 } : `git option ${flag} is not allowed`;
}

function checkWord(policy: Policy, word: string): null | string {
  if (policy.positional === "refs") {
    return SAFE_REF.test(word) ? null : `"${word.slice(0, 40)}" is not a plain ref name`;
  }

  if (policy.positional !== "none" && policy.positional.word === word) {
    return null;
  }

  return `git argument ${word.slice(0, 40)} is not allowed`;
}

/** null when the argv is permitted, otherwise the reason it is not. */
export function validateGitArgs(args: readonly string[]): null | string {
  const [command = "", ...rest] = args;
  const policy = POLICIES[command];

  if (!policy) {
    return `git ${command.slice(0, 40)} is not an allowed command`;
  }

  let index = 0;

  while (index < rest.length) {
    const arg = rest[index] as string;

    if (arg === "--") {
      return rest.slice(index + 1).every(safeRepoPath) ? null : "a path argument is not allowed";
    }

    const failure = arg.startsWith("-") ? checkFlag(policy, rest, index) : checkWord(policy, arg);

    if (typeof failure === "string") {
      return failure;
    }

    index = failure ? failure.next : index + 1;
  }

  return null;
}

/** Fixed settings that stop a repository's own config from running anything while it is only being read. */
const HARDENING_ARGS = [
  "--no-pager",
  "--no-optional-locks",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "core.pager=cat",
  "-c",
  "diff.external=",
  "-c",
  "core.quotepath=off"
];

export function gitEnvironment(): NodeJS.ProcessEnv {
  return {
    GIT_ASKPASS: "echo",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_PAGER: "cat",
    GIT_TERMINAL_PROMPT: "0",
    HOME: "/nonexistent",
    LC_ALL: "C",
    PATH: "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin"
  };
}

const GIT_CANDIDATES = ["/opt/homebrew/bin/git", "/usr/local/bin/git", "/usr/bin/git"];

export const resolveGitBinary = (exists: (file: string) => boolean = existsSync): null | string =>
  GIT_CANDIDATES.find(exists) ?? null;

export type GitResult =
  | { code: number; ok: true; stdout: string; truncated: boolean }
  | { error: string; ok: false };

export interface GitRunnerOptions {
  gitBin?: null | string;
  maxBytes?: number;
  spawn?: typeof nodeSpawn;
  timeoutMs?: number;
}

export interface GitRunOptions {
  /** Exit codes that are answers rather than failures (`check-ignore` uses 1 for "nothing ignored"). */
  okCodes?: readonly number[];
}

interface Limits {
  maxBytes: number;
  timeoutMs: number;
}

/** Stdout up to a byte cap; the first chunk to cross it is cut and everything after is dropped. */
class CappedOutput {
  private readonly chunks: Buffer[] = [];
  private size = 0;
  truncated = false;

  constructor(private readonly maxBytes: number) {}

  /** Returns true when the cap was just hit and the process should be stopped. */
  push(chunk: Buffer): boolean {
    if (this.size + chunk.length <= this.maxBytes) {
      this.size += chunk.length;
      this.chunks.push(chunk);

      return false;
    }

    this.chunks.push(chunk.subarray(0, Math.max(0, this.maxBytes - this.size)));
    this.size = this.maxBytes;
    this.truncated = true;

    return true;
  }

  text(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

function execGit(spawn: typeof nodeSpawn, bin: string, job: { args: readonly string[]; cwd: string; okCodes: readonly number[] }, limits: Limits): Promise<GitResult> {
  return new Promise(resolve => {
    const child = spawn(bin, [...HARDENING_ARGS, ...job.args], {
      cwd: job.cwd,
      env: gitEnvironment(),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });

    const out = new CappedOutput(limits.maxBytes);
    let stderr = "";
    let settled = false;

    const finish = (result: GitResult) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(result);
      }
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ error: "git took too long and was stopped.", ok: false });
    }, limits.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => out.push(chunk) && child.kill("SIGKILL"));
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(0, STDERR_CAP);
    });
    child.on("error", error => finish({ error: `git could not start: ${error.message}`, ok: false }));

    child.on("close", code => {
      const exit = code ?? (out.truncated ? 0 : -1);

      finish(
        out.truncated || exit === 0 || job.okCodes.includes(exit)
          ? { code: exit, ok: true, stdout: out.text(), truncated: out.truncated }
          : { error: stderr.trim().split("\n")[0] || `git exited with code ${exit}`, ok: false }
      );
    });
  });
}

export function createGitRunner(options: GitRunnerOptions = {}) {
  const gitBin = options.gitBin === undefined ? resolveGitBinary() : options.gitBin;
  const spawn = options.spawn ?? nodeSpawn;
  const limits = { maxBytes: options.maxBytes ?? GIT_OUTPUT_CAP, timeoutMs: options.timeoutMs ?? GIT_TIMEOUT_MS };

  const run = (cwd: string, args: readonly string[], runOptions: GitRunOptions = {}): Promise<GitResult> => {
    const refusal = validateGitArgs(args);

    if (refusal) {
      return Promise.resolve({ error: refusal, ok: false });
    }

    return gitBin
      ? execGit(spawn, gitBin, { args, cwd, okCodes: runOptions.okCodes ?? [] }, limits)
      : Promise.resolve({ error: "git is not installed on this computer.", ok: false });
  };

  return { available: Boolean(gitBin), run };
}

export type GitRunner = ReturnType<typeof createGitRunner>;
