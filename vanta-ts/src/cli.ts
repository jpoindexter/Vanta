import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mirrorLegacyEnv } from "./env-compat.js";
import { ensureVantaStore } from "./store/home.js";
import { runScheduleCommand, runCron } from "./schedule/commands.js";
import { runRoomsList, runModes } from "./projects/commands.js";
import { runAuthCommand } from "./google/commands.js";
import { runChat } from "./interactive.js";
import { runTuiV2 } from "./ui/launch.js";
import { runSetup } from "./setup.js";
import { runFullSetup } from "./setup-full.js";
import { runMessagingSetup } from "./setup-messaging.js";
import { runStatus } from "./status.js";
import { resolveProvider } from "./providers/index.js";
import {
  dataDirFor,
  buildCronRunTask,
  runGatewayCommand,
  runServiceCommand,
  runMcpCommand,
  runRoadmapCommand,
  runFactoryCommand,
  runDesktopCommand,
  runPairingCommand,
  runConfigCommand,
} from "./cli/ops.js";
import { runEvalCommand } from "./cli/eval-cmd.js";
import { runModelCommand } from "./cli/model-cmd.js";
import { runUpdateCommand } from "./cli/update.js";
import { runAgentsCommand } from "./cli/agents-cmd.js";
import {
  usage,
  usageExit,
  runSessionsList,
  runInstruction,
  runSkillsCommand,
  runMemoryCommand,
  runVoiceCommand,
  runHooksCommand,
  runSkillCommand,
  runRoomCommand,
  type OutputFormat,
} from "./cli/commands.js";
import {
  runPluginsCommand,
  runTasteCommand,
  runModelsCommand,
  runAcpCommand,
  runProxyCommand,
  runRefCommand,
  runSettingsCommand,
  runBriefCommand,
} from "./cli/extra-cmds.js";
import { runLoopCommand } from "./cli/loop-cmd.js";
import { parseLifecycleFlags, runLifecycleHooks, type LifecycleFlags } from "./cli/lifecycle.js";
import { parsePermissionModeFlags } from "./cli/permission-mode.js";
import { runAutoModeCommand } from "./cli/auto-mode-cmd.js";
import { parseEffortFlag } from "./effort.js";

function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "Cargo.toml"))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

function loadEnv(repoRoot: string): void {
  try {
    process.loadEnvFile(join(repoRoot, "vanta-ts", ".env"));
  } catch {
    // no .env file — rely on the ambient environment
  }
  mirrorLegacyEnv(); // back-compat: existing ARGO_* configs → VANTA_*
}

/** True when a model backend resolves from the current env (a usable config exists). */
function isConfigured(env: NodeJS.ProcessEnv): boolean {
  try {
    resolveProvider(env);
    return true;
  } catch {
    return false;
  }
}

/**
 * Launch the interactive session, running the first-run wizard first if no
 * backend is configured. The auto-launch is TTY-gated: a non-interactive caller
 * (piped/cron) is told to run `vanta setup` rather than blocking on a prompt.
 */
async function maybeRunStartupLifecycle(repoRoot: string, lifecycle?: LifecycleFlags): Promise<boolean> {
  return lifecycle ? runLifecycleHooks(repoRoot, lifecycle, "interactive") : false;
}

async function ensureConfiguredOrSetup(repoRoot: string): Promise<boolean> {
  if (!isConfigured(process.env)) {
    if (!process.stdin.isTTY) {
      console.log("No model backend configured. Run `vanta setup` in a terminal first.");
      process.exit(1);
    }
    const wrote = await runFullSetup(repoRoot);
    if (!wrote) return false;
    loadEnv(repoRoot); // pick up the freshly written .env
  }
  return true;
}

async function startInteractive(
  repoRoot: string,
  opts: { resumeId?: string; noTui?: boolean; forkSession?: boolean; lifecycle?: LifecycleFlags } = {},
): Promise<void> {
  if (await maybeRunStartupLifecycle(repoRoot, opts.lifecycle)) return;
  if (!await ensureConfiguredOrSetup(repoRoot)) return;
  // The Claude-method Ink TUI is the default interactive surface; fall back to the
  // readline REPL for resume (the TUI doesn't rehydrate), --no-tui, VANTA_NO_TUI,
  // or no TTY.
  const useTui =
    Boolean(process.stdin.isTTY) && !opts.resumeId && !opts.noTui && !process.env.VANTA_NO_TUI;
  if (!useTui) return runChat(repoRoot, opts);
  // REL3: wrap TUI launch in a try-catch; fall back to readline REPL if Ink
  // fails to render (bad TERM, missing native deps, restricted environment).
  try {
    return await runTuiV2(repoRoot);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`\nTUI unavailable (${msg.split("\n")[0]}); falling back to readline REPL.\nSet VANTA_NO_TUI=1 to suppress this warning.\n`);
    return runChat(repoRoot, opts);
  }
}

/** Extract a `--resume <id>` value from args, if present. */
function resumeIdFrom(args: string[]): string | undefined {
  const i = args.indexOf("--resume");
  return i >= 0 ? args[i + 1] : undefined;
}

function hasForkSession(args: string[]): boolean {
  return args.includes("--fork-session");
}

/** A subcommand handler. A returned number is used as the process exit code. */
type CommandFn = (repoRoot: string, rest: string[]) => Promise<number | void> | number | void;

// `vanta <cmd>` dispatch table. The interactive entry points (chat/resume/run)
// parse flags, so they stay as explicit checks in main(); everything else is here.
const COMMANDS: Record<string, CommandFn> = {
  sessions: () => runSessionsList(),
  help: () => usage(),
  "-h": () => usage(),
  "--help": () => usage(),
  setup: async (root, rest) => { if (rest[0] === "messaging") await runMessagingSetup(root); else if (rest[0] === "model") await runSetup(root); else await runFullSetup(root); },
  status: () => runStatus(),
  doctor: () => runStatus(),
  schedule: async (root, rest) => {
    const code = await runScheduleCommand(dataDirFor(root), rest);
    if (code !== 0) usage();
    return code;
  },
  config: (root, rest) => runConfigCommand(root, rest),
  cron: (root) => runCron(dataDirFor(root), new Date(), buildCronRunTask(root)),
  gateway: (root) => runGatewayCommand(root),
  service: (root, rest) => runServiceCommand(root, rest),
  skills: (_root, rest) => runSkillsCommand(rest),
  skill: (root, rest) => runSkillCommand(root, rest),
  rooms: () => runRoomsList(process.env),
  room: (root, rest) => runRoomCommand(root, rest),
  modes: (_root, rest) => runModes(process.env, rest[0]),
  auth: (_root, rest) => runAuthCommand(rest[0]),
  voice: (root) => runVoiceCommand(root),
  hooks: (_root, rest) => runHooksCommand(rest),
  mcp: (root, rest) => runMcpCommand(root, rest),
  roadmap: (root, rest) => runRoadmapCommand(root, rest),
  eval: (root, rest) => runEvalCommand(root, rest),
  desktop: (root, rest) => runDesktopCommand(root, rest),
  browser: async (_root, rest) => (await import("./cli/browser-cmd.js")).runBrowserCommand(rest),
  memory: (_root, rest) => runMemoryCommand(rest),
  audit: async (root) => (await import("./cli/audit.js")).runAudit(root),
  lint: async (root, rest) => (await import("./lint/run.js")).runLint(root, rest),
  open: async (_root, rest) => {
    const r = await (await import("./editor/open.js")).openInEditor(rest.join(" "));
    console.log(r.message);
    return r.ok ? 0 : 1;
  },
  "prompt-size": async (root) => (await import("./cli-dx/prompt-size.js")).runPromptSize(root),
  completion: async (_root, rest) => (await import("./cli-dx/completion.js")).runCompletion(rest),
  backup: async (_root, rest) => (await import("./cli-dx/backup.js")).runBackup(rest),
  import: async (_root, rest) => (await import("./cli-dx/backup.js")).runImport(rest),
  improve: (root) => runFactoryCommand(root, "review"),
  factory: (root, rest) => runFactoryCommand(root, rest[0] ?? ""),
  brief: (root) => runBriefCommand(root),
  today: (root) => runBriefCommand(root),
  model: (root, rest) => runModelCommand(root, rest),
  pairing: (_root, rest) => runPairingCommand(rest),
  update: (root, rest) => runUpdateCommand(root, rest),
  plugins: (root, rest) => runPluginsCommand(root, rest),
  taste: (root, rest) => runTasteCommand(root, rest),
  models: (root, rest) => runModelsCommand(root, rest),
  acp: (root, rest) => runAcpCommand(root, rest),
  proxy: (root, rest) => runProxyCommand(root, rest),
  money: async (_root, _rest) => {
    const { loadLifeOs } = await import("./life-os/store.js");
    const { buildMoneyBrief } = await import("./life-os/money.js");
    const target = Number(process.env.VANTA_MONEY_TARGET) || 5_000;
    const data = await loadLifeOs(process.env);
    console.log(buildMoneyBrief(data, target));
    return 0;
  },
  ref: (root, rest) => runRefCommand(root, rest),
  settings: (root, rest) => runSettingsCommand(root, rest),
  loop: (root, rest) => runLoopCommand(root, rest),
  agents: (root, rest) => runAgentsCommand(root, rest),
  attach: (root, rest) => runAgentsCommand(root, ["attach", ...rest]),
  logs: (root, rest) => runAgentsCommand(root, ["logs", ...rest]),
  respawn: (root, rest) => runAgentsCommand(root, ["respawn", ...rest]),
  stop: (root, rest) => runAgentsCommand(root, ["stop", ...rest]),
  rm: (root, rest) => runAgentsCommand(root, ["rm", ...rest]),
  daemon: (root, rest) => runAgentsCommand(root, ["daemon", ...rest]),
  "auto-mode": (root, rest) => runAutoModeCommand(root, rest),
};

/** Parse the `run` subcommand args into instruction + outputFormat + optional jsonSchema. */
function parseRunArgs(rest: string[]): { instruction: string; outputFormat: OutputFormat; jsonSchema?: string } {
  const fmtIdx = rest.indexOf("--output-format");
  const rawFmt = fmtIdx >= 0 ? rest[fmtIdx + 1] : undefined;
  const outputFormat: OutputFormat =
    rawFmt === "json" || rawFmt === "stream-json" ? rawFmt : "text";
  const schemaIdx = rest.indexOf("--json-schema");
  const jsonSchema = schemaIdx >= 0 ? rest[schemaIdx + 1] : undefined;
  const skipIdxs = new Set<number>([
    fmtIdx, fmtIdx + 1, schemaIdx, schemaIdx + 1,
  ].filter((i) => i >= 0));
  const instrArgs = rest.filter((_, i) => !skipIdxs.has(i));
  return { instruction: instrArgs.join(" "), outputFormat, jsonSchema };
}

function parseStartupFlags(args: string[]): { rest: string[]; lifecycle: LifecycleFlags } {
  const permissionParse = parsePermissionModeFlags(args, process.env);
  if (permissionParse.error) {
    console.error(permissionParse.error);
    process.exit(1);
  }
  process.env = permissionParse.env;
  const effortParse = parseEffortFlag(permissionParse.rest, permissionParse.env);
  if (effortParse.error) {
    console.error(effortParse.error);
    process.exit(1);
  }
  process.env = effortParse.env;
  const lifecycleParse = parseLifecycleFlags(effortParse.rest);
  return { rest: lifecycleParse.rest, lifecycle: lifecycleParse.flags };
}

async function main(): Promise<void> {
  const repoRoot = findRepoRoot();
  loadEnv(repoRoot);
  await ensureVantaStore();

  const { rest: parsedArgs, lifecycle } = parseStartupFlags(process.argv.slice(2));
  const [cmd, ...rest] = parsedArgs;

  // Interactive entry points parse flags, so they stay explicit.
  if (cmd === undefined || cmd === "chat")
    return startInteractive(repoRoot, { resumeId: resumeIdFrom(rest), noTui: rest.includes("--no-tui"), forkSession: hasForkSession(rest), lifecycle });
  if (cmd === "--resume" || cmd === "resume") return startInteractive(repoRoot, { resumeId: rest[0], forkSession: hasForkSession(rest), lifecycle });
  if (cmd === "run" && rest.length > 0) {
    const { instruction, outputFormat, jsonSchema } = parseRunArgs(rest);
    return runInstruction(repoRoot, instruction, { outputFormat, jsonSchema, lifecycle });
  }

  const handler = COMMANDS[cmd];
  if (!handler) return usageExit();
  const code = await handler(repoRoot, rest);
  if (typeof code === "number") process.exit(code);
}

main().catch((err: unknown) => {
  console.error(`\nvanta error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
