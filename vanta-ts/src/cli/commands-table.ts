// The `vanta <cmd>` dispatch table, split out of cli.ts for the size gate.
// cli.ts owns bootstrap + the interactive entry points (chat/resume/run) that
// parse global flags; everything else maps through this table (a returned
// number = process exit code). Adding a command = one entry here. Do NOT change
// which command maps to what — cli.ts dispatches this table verbatim.
import { runScheduleCommand, runCron } from "../schedule/commands.js";
import { runRoomsList, runModes } from "../projects/commands.js";
import { runAuthCommand } from "../google/commands.js";
import { runSetup } from "../setup.js";
import { runFullSetup } from "../setup-full.js";
import { runMessagingSetup } from "../setup-messaging.js";
import { runTtsSetup } from "../setup-tts.js";
import { runStatus } from "../status.js";
import { runMigrate } from "./migrate-cmd.js";
import { runAgentImageCommand } from "./agent-image-cmd.js";
import { runPreflight, formatPreflight, commandExists, detectPlatform, PREFLIGHT_TOOLS } from "../setup/preflight.js";
import { runBetaProofCommand } from "./beta-proof-cmd.js";
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
  runPluginCommand,
  runDeptCommand,
  runLibraryCommand,
} from "./ops.js";
import { runEvalCommand } from "./eval-cmd.js";
import { runEvolveCommand } from "./evolve-cmd.js";
import { runModelCommand } from "./model-cmd.js";
import { runOkrCommand } from "./okr-cmd.js";
import { runExchangeCommand } from "./exchange-cmd.js";
import { runAuthorityCommand } from "./authority-cmd.js";
import { runPlaybookCommand } from "./playbook-cmd.js";
import { runReviewCommand } from "./review-cmd.js";
import { runHandoffCommand } from "./handoff-cmd.js";
import { runProposalCommand } from "./proposal-cmd.js";
import { runOrgCommand } from "./org-cmd.js";
import { runUpdateCommand } from "./update.js";
import { runAgentsCommand } from "./agents-cmd.js";
import { runGoalsCommand } from "./goals-cmd.js";
import { runCompanyCommand } from "./company-cmd.js";
import {
  usage,
  runSessionsList,
  runVoiceCommand,
  runRoomCommand,
} from "./commands.js";
import { runSkillsCommand, runSkillCommand } from "./skills-cmd.js";
import { runMemoryCommand } from "./memory-cmd.js";
import { runHooksCommand } from "./hooks-cmd.js";
import {
  runPluginsCommand,
  runTasteCommand,
  runModelsCommand,
  runAcpCommand,
  runProxyCommand,
  runRefCommand,
  runSettingsCommand,
  runCommandCenterCommand,
  runBriefCommand,
} from "./extra-cmds.js";
import { runLoopCommand } from "./loop-cmd.js";
import { runAutoModeCommand } from "./auto-mode-cmd.js";
import { runFleetCommand } from "./fleet-cmd.js";
import { runBatchCommand } from "./batch-cmd.js";
import { runSshCommand } from "./ssh-cmd.js";
import { runHireCommand } from "./hire-cmd.js";
import { runHeartbeatCommand } from "../heartbeat/run-cmd.js";
import { runProactiveCommand } from "./proactive-cmd.js";
import { runWatchdogCommand } from "./watchdog-cmd.js";
import { runAutoResearchCommand } from "./auto-research-cmd.js";
import { runMetaTuneCommand } from "./meta-tune-cmd.js";
import { runTuneCommand } from "./tune-cmd.js";
import { runControlCommand } from "./control-cmd.js";
import { runRunnerCommand } from "./runner-cmd.js";
import { runWorkspaceCommand } from "./workspace-cmd.js";
import { runBlueprintCommand } from "./blueprint-cmd.js";
import { runWorldCommand } from "./world-cmd.js";
import { runQueueCommand } from "./queue-cmd.js";
import { runWhatCanIDoCommand } from "./what-can-i-do-cmd.js";
import { runHomeCommand } from "./home-cmd.js";
import { runCrashDiagnoseCommand } from "./crash-diagnose-cmd.js";
import { runSpecToAppCommand } from "./spec-to-app-cmd.js";
import { runAutonomyCommand } from "./autonomy-cmd.js";
import { runResearchReceiptsCommand } from "./research-receipts-cmd.js";
import { runIntentCommand } from "./intent-cmd.js";
import { runAutoWatchCommand } from "./auto-watch-cmd.js";
import { runMarketingCommand } from "./marketing-cmd.js";
import { runAmbientScreenCommand } from "./ambient-screen-cmd.js";
import { runLifeSearchCommand } from "./lifesearch-cmd.js";
import { runHarnessThicknessCommand } from "./harness-thickness-cmd.js";
import { runKanbanCommand } from "./kanban-cmd.js";
import { runLeadCommand } from "./lead-cmd.js";
import { runDeepPlanCommand } from "./deep-plan-cmd.js";
import { runRuntimeCommand } from "./runtime-cmd.js";
import { runAdversarialUxCommand } from "./adversarial-ux-cmd.js";
import { runEgressCommand } from "./egress-cmd.js";
import { runBillingCommand } from "./billing-cmd.js";
import { runOsintCommand } from "./osint-cmd.js";
import { runApiCommand } from "./api-cmd.js";
import { runTrajectoryCommand } from "./trajectory-cmd.js";
import { runBackendCommand } from "./backend-cmd.js";
import { runNowCommand } from "./now-cmd.js";
import { runKeybindingsCommand } from "./keybindings-cmd.js";
import { runRunAnywhereCommand } from "./run-anywhere-cmd.js";
import { runA2aCommand } from "./a2a-cmd.js";
import { runProfilesCommand } from "./profiles-cmd.js";
import { runProfileCommand } from "./profile-cmd.js";
import { runCorpusCommand } from "./corpus-cmd.js";
import { runStoryEvalCommand } from "./story-eval-cmd.js";
import { runToolsCommand } from "./tools-cmd.js";
import { runWebhookCommand } from "./webhook-workflow-cmd.js";
import { runSecretsCommand } from "./secrets-vault-cmd.js";
import { runAutomationCommand } from "./automation-cmd.js";

/** A subcommand handler. A returned number is used as the process exit code. */
export type CommandFn = (repoRoot: string, rest: string[]) => Promise<number | void> | number | void;

// `vanta <cmd>` dispatch table. The interactive entry points (chat/resume/run)
// parse flags, so they stay as explicit checks in cli.ts main(); everything else is here.
export const COMMANDS: Record<string, CommandFn> = {
  automation: (root, rest) => runAutomationCommand(dataDirFor(root), rest),
  secrets: (_root, rest) => runSecretsCommand(rest),
  webhook: (root, rest) => runWebhookCommand(dataDirFor(root), rest),
  tools: (root, rest) => runToolsCommand(root, rest),
  "story-eval": (root, rest) => runStoryEvalCommand(root, rest),
  corpus: (_root, rest) => runCorpusCommand(rest),
  profile: (_root, rest) => runProfileCommand(rest),
  profiles: (_root, rest) => runProfilesCommand(rest),
  sessions: () => runSessionsList(),
  help: () => usage(),
  "-h": () => usage(),
  "--help": () => usage(),
  "what-can-i-do": (root, rest) => runWhatCanIDoCommand(rest, dataDirFor(root)),
  "diagnose-crash": (_root, rest) => runCrashDiagnoseCommand(rest),
  "spec-to-app": (root, rest) => runSpecToAppCommand(root, rest),
  "research-receipts": (_root, rest) => runResearchReceiptsCommand(rest),
  intent: (_root, rest) => runIntentCommand(rest),
  "auto-watch": (root, rest) => runAutoWatchCommand(root, rest),
  marketing: (_root, rest) => runMarketingCommand(rest),
  "ambient-screen": (root, rest) => runAmbientScreenCommand(root, rest),
  lifesearch: (root, rest) => runLifeSearchCommand(root, rest),
  "harness-thickness": (root, rest) => runHarnessThicknessCommand(root, rest),
  kanban: (root, rest) => runKanbanCommand(root, rest),
  lead: (_root, rest) => runLeadCommand(rest),
  "deep-plan": (_root, rest) => runDeepPlanCommand(rest),
  runtime: (root, rest) => runRuntimeCommand(root, rest),
  backend: (root, rest) => runBackendCommand(root, rest),
  "run-anywhere": (root, rest) => runRunAnywhereCommand(root, rest),
  a2a: (root, rest) => runA2aCommand(root, rest),
  "adversarial-ux": (root, rest) => runAdversarialUxCommand(root, rest),
  egress: (_root, rest) => runEgressCommand(rest),
  billing: (root, rest) => runBillingCommand(dataDirFor(root), rest),
  osint: (_root, rest) => runOsintCommand(rest),
  autonomy: (root, rest) => runAutonomyCommand(root, rest),
  api: (root, rest) => runApiCommand(root, rest),
  home: (root) => runHomeCommand(dataDirFor(root)),
  setup: async (root, rest) => { if (rest[0] === "messaging") await runMessagingSetup(root); else if (rest[0] === "tts") await runTtsSetup(root); else if (rest[0] === "model") await runSetup(root); else await runFullSetup(root); },
  status: (_root, rest) => runStatus(process.env, rest),
  doctor: (_root, rest) => runStatus(process.env, rest),
  keybindings: (_root, rest) => runKeybindingsCommand(rest),
  migrate: (_root, rest) => runMigrate(rest),
  "agent-image": (_root, rest) => runAgentImageCommand(rest),
  preflight: () => {
    const platform = detectPlatform();
    const res = runPreflight(commandExists, PREFLIGHT_TOOLS, platform);
    console.log(formatPreflight(res, platform));
    return res.ok ? 0 : 1;
  },
  "beta-proof": (root) => runBetaProofCommand(root),
  schedule: async (root, rest) => {
    const code = await runScheduleCommand(dataDirFor(root), rest);
    if (code !== 0) usage();
    return code;
  },
  config: (root, rest) => runConfigCommand(root, rest),
  cron: (root) => runCron(dataDirFor(root), new Date(), buildCronRunTask(root)),
  gateway: (root, rest) => runGatewayCommand(root, rest),
  service: (root, rest) => runServiceCommand(root, rest),
  skills: (_root, rest) => runSkillsCommand(rest),
  skill: (root, rest) => runSkillCommand(root, rest),
  rooms: () => runRoomsList(process.env),
  room: (root, rest) => runRoomCommand(root, rest),
  modes: (_root, rest) => runModes(process.env, rest[0]),
  auth: (_root, rest) => runAuthCommand(rest),
  voice: (root, rest) => runVoiceCommand(root, rest),
  control: (root, rest) => runControlCommand(root, rest),
  hooks: (_root, rest) => runHooksCommand(rest),
  mcp: (root, rest) => runMcpCommand(root, rest),
  roadmap: (root, rest) => runRoadmapCommand(root, rest),
  now: (root, rest) => runNowCommand(root, rest),
  eval: (root, rest) => runEvalCommand(root, rest),
  evolve: (root, rest) => runEvolveCommand(root, rest),
  desktop: (root, rest) => runDesktopCommand(root, rest),
  browser: async (_root, rest) => (await import("./browser-cmd.js")).runBrowserCommand(rest),
  governance: async (root, rest) => (await import("./governance-cmd.js")).runGovernanceCommand(root, rest),
  memory: (_root, rest) => runMemoryCommand(rest),
  audit: async (root) => (await import("./audit.js")).runAudit(root),
  lint: async (root, rest) => (await import("../lint/run.js")).runLint(root, rest),
  open: async (_root, rest) => {
    const r = await (await import("../editor/open.js")).openInEditor(rest.join(" "));
    console.log(r.message);
    return r.ok ? 0 : 1;
  },
  "prompt-size": async (root) => (await import("../cli-dx/prompt-size.js")).runPromptSize(root),
  completion: async (_root, rest) => (await import("../cli-dx/completion.js")).runCompletion(rest),
  backup: async (_root, rest) => (await import("../cli-dx/backup.js")).runBackup(rest),
  import: async (_root, rest) => (await import("../cli-dx/backup.js")).runImport(rest),
  improve: (root) => runFactoryCommand(root, "review"),
  factory: (root, rest) => runFactoryCommand(root, rest[0] ?? ""),
  brief: (root) => runBriefCommand(root),
  today: (root) => runBriefCommand(root),
  "command-center": () => runCommandCenterCommand(),
  model: (root, rest) => runModelCommand(root, rest),
  pairing: (_root, rest) => runPairingCommand(rest),
  update: (root, rest) => runUpdateCommand(root, rest),
  plugins: (root, rest) => runPluginsCommand(root, rest),
  plugin: (root, rest) => runPluginCommand(root, rest),
  taste: (root, rest) => runTasteCommand(root, rest),
  models: (root, rest) => runModelsCommand(root, rest),
  acp: (root, rest) => runAcpCommand(root, rest),
  proxy: (root, rest) => runProxyCommand(root, rest),
  money: async (_root, _rest) => {
    const { loadLifeOs } = await import("../life-os/store.js");
    const { buildMoneyBrief } = await import("../life-os/money.js");
    const target = Number(process.env.VANTA_MONEY_TARGET) || 5_000;
    const data = await loadLifeOs(process.env);
    console.log(buildMoneyBrief(data, target));
    return 0;
  },
  ref: (root, rest) => runRefCommand(root, rest),
  settings: (root, rest) => runSettingsCommand(root, rest),
  loop: (root, rest) => runLoopCommand(root, rest),
  agents: (root, rest) => runAgentsCommand(root, rest),
  hire: (root, rest) => runHireCommand(root, rest),
  dept: (root, rest) => runDeptCommand(root, rest),
  company: (root, rest) => runCompanyCommand(root, rest),
  library: (root, rest) => runLibraryCommand(root, rest),
  okr: (_root, rest) => runOkrCommand(rest),
  exchange: (_root, rest) => runExchangeCommand(rest),
  authority: (_root, rest) => runAuthorityCommand(rest),
  playbook: (_root, rest) => runPlaybookCommand(rest),
  review: (_root, rest) => runReviewCommand(rest),
  handoff: (_root, rest) => runHandoffCommand(rest),
  proposal: (_root, rest) => runProposalCommand(rest),
  org: (_root, rest) => runOrgCommand(rest),
  heartbeat: (root) => runHeartbeatCommand(root),
  goals: (root, rest) => runGoalsCommand(root, { rest }),
  fleet: (root, rest) => runFleetCommand(root, rest),
  batch: (root, rest) => runBatchCommand(root, rest),
  ssh: (root, rest) => runSshCommand(root, rest),
  proactive: (root, rest) => runProactiveCommand(root, rest),
  watchdog: (root, rest) => runWatchdogCommand(root, rest),
  runner: (root, rest) => runRunnerCommand(root, rest),
  workspace: (root, rest) => runWorkspaceCommand(root, rest),
  blueprint: (root, rest) => runBlueprintCommand(root, rest),
  world: (root, rest) => runWorldCommand(root, rest),
  queue: (root, rest) => runQueueCommand(root, rest),
  attach: (root, rest) => runAgentsCommand(root, ["attach", ...rest]),
  logs: (root, rest) => runAgentsCommand(root, ["logs", ...rest]),
  respawn: (root, rest) => runAgentsCommand(root, ["respawn", ...rest]),
  stop: (root, rest) => runAgentsCommand(root, ["stop", ...rest]),
  rm: (root, rest) => runAgentsCommand(root, ["rm", ...rest]),
  daemon: (root, rest) => runAgentsCommand(root, ["daemon", ...rest]),
  "auto-mode": (root, rest) => runAutoModeCommand(root, rest),
  "auto-research": (root, rest) => runAutoResearchCommand(root, rest),
  "meta-tune": (root, rest) => runMetaTuneCommand(root, rest),
  tune: (root, rest) => runTuneCommand(root, rest),
  trajectory: (_root, rest) => runTrajectoryCommand(rest),
};
