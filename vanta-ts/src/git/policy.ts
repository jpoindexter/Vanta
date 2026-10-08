import { buildSafeChildEnv } from "../exec/child-env.js";

const COMMANDS = new Set("add apply blame branch checkout clean clone commit config describe diff fetch grep init log ls-files ls-remote ls-tree merge merge-base pull push remote reset restore rev-list rev-parse show show-ref stash status switch tag worktree".split(" "));
const RENDERING = new Set(["diff", "show", "log", "blame"]);
const OVERRIDES: Record<string, string> = {
  "core.fsmonitor": "false", "core.hooksPath": "/dev/null",
  "core.pager": "cat", "core.editor": "false", "sequence.editor": "false",
  "core.sshCommand": "false", "credential.helper": "", "credential.interactive": "false",
  "commit.gpgSign": "false", "tag.gpgSign": "false", "gpg.program": "false",
  "gc.auto": "0", "maintenance.auto": "false", "init.templateDir": "/dev/null",
  "protocol.allow": "never", "protocol.file.allow": "always",
  "protocol.http.allow": "always", "protocol.https.allow": "always",
  "http.extraHeader": "", "http.cookieFile": "", "http.saveCookies": "false",
  "core.gitProxy": "false",
  "diff.external": "", "interactive.diffFilter": "", "core.askPass": "false",
  "uploadpack.packObjectsHook": "",
  "submodule.recurse": "false", "fetch.recurseSubmodules": "false",
};

export function gitEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...buildSafeChildEnv(env), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "false",
    SSH_ASKPASS: "false", GIT_PAGER: "cat", GIT_EDITOR: "false", GIT_SEQUENCE_EDITOR: "false",
    GIT_SSH_COMMAND: "false", GIT_OPTIONAL_LOCKS: "0", GCM_INTERACTIVE: "never" };
}

export function gitCommandIndex(args: readonly string[]): number {
  let i = 0;
  while (args[i]?.startsWith("-")) {
    if (args[i] === "-C") { i += 2; continue; }
    if (args[i] === "-c" && /^(gc\.auto|maintenance\.auto)=/.test(args[i + 1] ?? "")) { i += 2; continue; }
    if (["--no-pager", "--no-optional-locks"].includes(args[i]!)) { i++; continue; }
    throw new Error(`Git execution override requires separate authority: ${args[i]}`);
  }
  if (!COMMANDS.has(args[i] ?? "")) throw new Error("Git aliases and unknown commands require separate execution authority");
  return i;
}

export function gitConfigurationArgs(config = ""): string[] {
  const pins = { ...OVERRIDES };
  for (const row of config.split("\0")) {
    const key = row.split("\n", 1)[0]!;
    if (/^filter\..+\.(clean|smudge|process)$/i.test(key)) pins[key] = "";
    if (/^filter\..+\.required$/i.test(key)) pins[key] = "false";
    if (/^remote\..+\.(vcs|uploadpack|receivepack)$/i.test(key)) pins[key] = "";
    if (/^http\..+\.(extraheader|cookiefile)$/i.test(key)) pins[key] = "";
    if (/^credential\..+\.helper$/i.test(key)) pins[key] = "";
  }
  return Object.entries(pins).flatMap(([key, value]) => ["-c", `${key}=${value}`]);
}

export function hardenedGitArgs(args: readonly string[], config = ""): string[] {
  const i = gitCommandIndex(args);
  rejectImplicitTransportCredentials(args[i]!, config);
  const tail = args.slice(i + 1);
  if (tail.some((arg) => /^(--ext-diff|--textconv|--exec(?:=|$)|--upload-pack(?:=|$)|--receive-pack(?:=|$)|--open-files-in-pager(?:=|$)|--output(?:=|$))/.test(arg))) {
    throw new Error("Git subprocess options require separate execution authority");
  }
  const rendering = RENDERING.has(args[i]!) ? ["--no-ext-diff", "--no-textconv"] : [];
  const transport = transportArgs(args[i]!);
  return ["--no-pager", ...args.slice(0, i), ...gitConfigurationArgs(config), args[i]!, ...rendering, ...transport, ...tail];
}

function transportArgs(command: string): string[] {
  const server = "git -c core.hooksPath=/dev/null -c core.fsmonitor=false -c gc.auto=0 -c maintenance.auto=false -c uploadpack.packObjectsHook=";
  if (command === "push") return [`--receive-pack=${server} receive-pack`];
  return ["clone", "fetch", "pull", "ls-remote"].includes(command) ? [`--upload-pack=${server} upload-pack`] : [];
}

function rejectImplicitTransportCredentials(command: string, config: string): void {
  if (!["clone", "fetch", "pull", "push", "ls-remote"].includes(command)) return;
  for (const row of config.split("\0")) {
    const [key = "", value = ""] = row.split("\n", 2);
    if (/^http\.(?:.*\.)?(sslcert|sslkey|proxy)$/i.test(key) && value) {
      throw new Error("Repository client-certificate/proxy transport requires separate explicit authority");
    }
  }
}
