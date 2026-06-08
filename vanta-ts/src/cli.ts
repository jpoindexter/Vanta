import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mirrorLegacyEnv } from "./env-compat.js";
import { ensureVantaStore } from "./store/home.js";
import { runScheduleCommand, runCron } from "./schedule/commands.js";
import { runRoomsList, runModes } from "./projects/commands.js";
import { runAuthCommand } from "./google/commands.js";
import { runChat } from "./interactive.js";
import { runTui } from "./tui/launch.js";
import { runSetup } from "./setup.js";
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
} from "./cli/ops.js";
import { runModelCommand } from "./cli/model-cmd.js";
import { runUpdateCommand } from "./cli/update.js";
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
async function startInteractive(
  repoRoot: string,
  opts: { resumeId?: string; noTui?: boolean } = {},
): Promise<void> {
  if (!isConfigured(process.env)) {
    if (!process.stdin.isTTY) {
      console.log("No model backend configured. Run `vanta setup` in a terminal first.");
      process.exit(1);
    }
    const wrote = await runSetup(repoRoot);
    if (!wrote) return;
    loadEnv(repoRoot); // pick up the freshly written .env
  }
  // The Ink TUI is the default interactive surface; fall back to the readline
  // REPL for resume (TUI v1 doesn't rehydrate), --no-tui, VANTA_NO_TUI, or no TTY.
  const useTui =
    Boolean(process.stdin.isTTY) && !opts.resumeId && !opts.noTui && !process.env.VANTA_NO_TUI;
  if (!useTui) return runChat(repoRoot, opts);
  // REL3: wrap TUI launch in a try-catch; fall back to readline REPL if Ink
  // fails to render (bad TERM, missing native deps, restricted environment).
  try {
    return await runTui(repoRoot);
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

/** A subcommand handler. A returned number is used as the process exit code. */
type CommandFn = (repoRoot: string, rest: string[]) => Promise<number | void> | number | void;

// `vanta <cmd>` dispatch table. The interactive entry points (chat/resume/run)
// parse flags, so they stay as explicit checks in main(); everything else is here.
const COMMANDS: Record<string, CommandFn> = {
  sessions: () => runSessionsList(),
  help: () => usage(),
  "-h": () => usage(),
  "--help": () => usage(),
  setup: async (root, rest) => { if (rest[0] === "messaging") await runMessagingSetup(root); else await runSetup(root); },
  status: () => runStatus(),
  doctor: () => runStatus(),
  schedule: async (root, rest) => {
    const code = await runScheduleCommand(dataDirFor(root), rest);
    if (code !== 0) usage();
    return code;
  },
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
  desktop: (root, rest) => runDesktopCommand(root, rest),
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
  brief: async (root) => {
    const { buildBrief } = await import("./repl/brief-cmd.js");
    const { ensureKernel } = await import("./kernel-launcher.js");
    const { SafetyClient } = await import("./safety-client.js");
    const { join: pathJoin } = await import("node:path");
    const baseUrl = process.env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788";
    const kernelBin = pathJoin(root, "target", "debug", "vanta-kernel");
    await ensureKernel({ baseUrl, kernelBin, root }).catch(() => {});
    const safety = new SafetyClient(baseUrl);
    const out = await buildBrief({ dataDir: dataDirFor(root), env: process.env, getGoals: () => safety.getGoals() });
    console.log(out);
  },
  today: async (root, rest) => COMMANDS["brief"]!(root, rest),
  model: (root, rest) => runModelCommand(root, rest),
  pairing: (_root, rest) => runPairingCommand(rest),
  update: (root, rest) => runUpdateCommand(root, rest),
  acp: async (root, rest) => {
    const port = Number(rest[0]) || 7792;
    const { startAcpServer, writeAgentJson } = await import("./acp/server.js");
    const { prepareRun, buildSummarizer } = await import("./session.js");
    const { runAgent } = await import("./agent.js");
    const { approver: _approver } = await import("./session.js");
    const setup = await prepareRun(root, "acp session").catch(() => null);
    if (!setup) { console.error("vanta acp: failed to initialize"); return 1; }
    await writeAgentJson(root).catch(() => {});
    const run = async (instruction: string): Promise<string> => {
      const outcome = await runAgent(setup.systemPrompt, instruction, {
        provider: setup.provider,
        safety: setup.safety,
        registry: setup.registry,
        root,
        requestApproval: async () => false,
        summarize: buildSummarizer(setup.provider),
      });
      return outcome.finalText;
    };
    const srv = await startAcpServer({ port, repoRoot: root, run });
    console.log(`vanta acp: ACP server on http://127.0.0.1:${srv.port}`);
    console.log(`  agent.json at ${root}/agent.json`);
    console.log("  Ctrl+C to stop.");
    await new Promise<void>((resolve) => {
      process.once("SIGINT", () => { srv.close(); resolve(); });
      process.once("SIGTERM", () => { srv.close(); resolve(); });
    });
    return 0;
  },
  proxy: async (_root, rest) => {
    const port = Number(rest[0]) || 7791;
    const { startProxyServer } = await import("./proxy/server.js");
    const srv = await startProxyServer(port, process.env);
    console.log(`vanta proxy: OpenAI-compatible endpoint on http://127.0.0.1:${srv.port}`);
    console.log(`  OPENAI_API_KEY=vanta OPENAI_BASE_URL=http://127.0.0.1:${srv.port}/v1`);
    console.log("  Ctrl+C to stop.");
    await new Promise<void>((resolve) => {
      process.once("SIGINT", () => { srv.close(); resolve(); });
      process.once("SIGTERM", () => { srv.close(); resolve(); });
    });
    return 0;
  },
  money: async (_root, _rest) => {
    const { loadLifeOs } = await import("./life-os/store.js");
    const { buildMoneyBrief } = await import("./life-os/money.js");
    const target = Number(process.env.VANTA_MONEY_TARGET) || 5_000;
    const data = await loadLifeOs(process.env);
    console.log(buildMoneyBrief(data, target));
    return 0;
  },
  ref: async (_root, rest) => {
    const { addRef, searchRefs, listRefs, formatRefs, formatRefForContext } = await import("./refs/store.js");
    const sub = rest[0] ?? "list";
    if (sub === "add") {
      const source = rest[1];
      if (!source) { console.error("usage: vanta ref add <url|path>"); return 1; }
      let excerpt = "";
      if (/^https?:\/\//.test(source)) {
        try {
          const { extractReadable } = await import("./tools/web-fetch.js");
          const res = await fetch(source);
          excerpt = extractReadable(await res.text(), source).text.slice(0, 2000);
        } catch { excerpt = `(fetch failed)`; }
      } else {
        const { readFile } = await import("node:fs/promises");
        excerpt = (await readFile(source, "utf8").catch(() => "")).slice(0, 2000);
      }
      const ref = await addRef({ source, excerpt });
      console.log(`✓ ingested ${ref.id}: ${ref.title}`);
      return 0;
    }
    if (sub === "search") {
      const q = rest.slice(1).join(" ").trim();
      if (!q) { console.error("usage: vanta ref search <query>"); return 1; }
      const refs = await searchRefs(q);
      if (!refs.length) { console.log(`(no refs matched "${q}")`); return 0; }
      for (const r of refs.slice(0, 5)) console.log(`\n${formatRefForContext(r)}`);
      return 0;
    }
    console.log(formatRefs(await listRefs()));
    return 0;
  },
  settings: async (root, rest) => {
    const { loadSettings, userSettingsPath, projectSettingsPath, localSettingsPath, formatSettings } = await import("./settings/store.js");
    const sub = rest[0] ?? "show";
    if (sub === "show") {
      const s = await loadSettings(root);
      console.log(formatSettings(s, "merged"));
      return 0;
    }
    if (sub === "paths") {
      console.log(`  user:    ${userSettingsPath()}`);
      console.log(`  project: ${projectSettingsPath(root)}`);
      console.log(`  local:   ${localSettingsPath(root)}`);
      return 0;
    }
    console.log("usage: vanta settings [show | paths]");
    return 1;
  },
};

async function main(): Promise<void> {
  const repoRoot = findRepoRoot();
  loadEnv(repoRoot);
  await ensureVantaStore();

  const [cmd, ...rest] = process.argv.slice(2);

  // Interactive entry points parse flags, so they stay explicit.
  if (cmd === undefined || cmd === "chat")
    return startInteractive(repoRoot, { resumeId: resumeIdFrom(rest), noTui: rest.includes("--no-tui") });
  if (cmd === "--resume" || cmd === "resume") return startInteractive(repoRoot, { resumeId: rest[0] });
  if (cmd === "run" && rest.length > 0) {
    const fmtIdx = rest.indexOf("--output-format");
    const rawFmt = fmtIdx >= 0 ? rest[fmtIdx + 1] : undefined;
    const outputFormat: OutputFormat =
      rawFmt === "json" || rawFmt === "stream-json" ? rawFmt : "text";
    // Strip --output-format <value> from args before joining as the instruction.
    const instrArgs = rest.filter((_, i) => i !== fmtIdx && i !== fmtIdx + 1);
    return runInstruction(repoRoot, instrArgs.join(" "), { outputFormat });
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
