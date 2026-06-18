import { ensureVantaStore } from "./store/home.js";
import { runScheduleCommand, runCron } from "./schedule/commands.js";
import { runRoomsList, runModes } from "./projects/commands.js";
import { runAuthCommand } from "./google/commands.js";
import { runSetup } from "./setup.js";
import { runFullSetup } from "./setup-full.js";
import { runMessagingSetup } from "./setup-messaging.js";
import { runStatus } from "./status.js";
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
import { runEvolveCommand } from "./cli/evolve-cmd.js";
import { runModelCommand } from "./cli/model-cmd.js";
import { runUpdateCommand } from "./cli/update.js";
import { runAgentsCommand } from "./cli/agents-cmd.js";
import {
  usage,
  usageExit,
  runSessionsList,
  runInstruction,
  runVoiceCommand,
  runRoomCommand,
} from "./cli/commands.js";
import { runSkillsCommand, runSkillCommand } from "./cli/skills-cmd.js";
import { runMemoryCommand } from "./cli/memory-cmd.js";
import { runHooksCommand } from "./cli/hooks-cmd.js";
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
import { runAutoModeCommand } from "./cli/auto-mode-cmd.js";
import { runFleetCommand } from "./cli/fleet-cmd.js";
import { runAutoResearchCommand } from "./cli/auto-research-cmd.js";
import { runMetaTuneCommand } from "./cli/meta-tune-cmd.js";
import {
  findRepoRoot, loadEnv, startInteractive,
  resumeIdFrom, hasForkSession, parseRunArgs, parseStartupFlags,
} from "./cli/startup.js";

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
  evolve: (root, rest) => runEvolveCommand(root, rest),
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
  fleet: (root, rest) => runFleetCommand(root, rest),
  attach: (root, rest) => runAgentsCommand(root, ["attach", ...rest]),
  logs: (root, rest) => runAgentsCommand(root, ["logs", ...rest]),
  respawn: (root, rest) => runAgentsCommand(root, ["respawn", ...rest]),
  stop: (root, rest) => runAgentsCommand(root, ["stop", ...rest]),
  rm: (root, rest) => runAgentsCommand(root, ["rm", ...rest]),
  daemon: (root, rest) => runAgentsCommand(root, ["daemon", ...rest]),
  "auto-mode": (root, rest) => runAutoModeCommand(root, rest),
  "auto-research": (root, rest) => runAutoResearchCommand(root, rest),
  "meta-tune": (root, rest) => runMetaTuneCommand(root, rest),
};

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
