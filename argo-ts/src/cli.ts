import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { runAgent, createConversation } from "./agent.js";
import { ensureArgoStore } from "./store/home.js";
import { listSkills, readSkill } from "./skills/store.js";
import { installSkillLibrary } from "./skills/library.js";
import { listSessions } from "./sessions/store.js";
import { runGateway } from "./gateway/run.js";
import { TelegramAdapter, parseAllowlist } from "./gateway/platforms/telegram.js";
import { resolveDeliver } from "./gateway/webhook.js";
import { installService, uninstallService, serviceStatus } from "./service/manager.js";
import { resolveArgoHome } from "./store/home.js";
import { runScheduleCommand, runCron } from "./schedule/commands.js";
import {
  runRoomsList,
  resolveRoomOrExit,
  runModes,
  suggestSkillFromRun,
} from "./projects/commands.js";
import { runAuthCommand } from "./google/commands.js";
import {
  prepareRun,
  buildSummarizer,
  writeRunMemory,
  consoleCallbacks,
  approver,
  reviewAfterTurn,
  maybeCurate,
} from "./session.js";
import { runChat } from "./interactive.js";
import { runSetup } from "./setup.js";
import { runStatus } from "./status.js";
import { resolveProvider } from "./providers/index.js";
import type { RunTask } from "./schedule/runner.js";

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
    process.loadEnvFile(join(repoRoot, "argo-ts", ".env"));
  } catch {
    // no .env file — rely on the ambient environment
  }
}

function usage(): void {
  console.log(
    [
      "Usage: argo                              start an interactive session",
      "       argo sessions | resume <id>       list past sessions, or resume one",
      "       argo setup                        first-run wizard: pick a model backend",
      "       argo status | doctor              health check (kernel, provider, keys, store)",
      '       argo run "<instruction>"          run one instruction and exit',
      "       argo skills [install [--force]]   list skills, or install the bundled library",
      '       argo skill <name> ["<instruction>"]  print a skill, or run with it',
      '       argo schedule "<instruction>" --cron "<expr>" | schedule list',
      "       argo cron                         run due tasks once (for launchd/cron)",
      "       argo gateway                      run the scheduler as a foreground daemon",
      "       argo service [install|uninstall|status]   manage the background launchd agent",
      "       argo rooms | room <name> [\"<instruction>\"]   project rooms",
      "       argo modes [list|install]         operator modes",
      "       argo auth google                  one-time Google OAuth",
    ].join("\n"),
  );
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
 * (piped/cron) is told to run `argo setup` rather than blocking on a prompt.
 */
async function startInteractive(
  repoRoot: string,
  opts: { resumeId?: string } = {},
): Promise<void> {
  if (!isConfigured(process.env)) {
    if (!process.stdin.isTTY) {
      console.log("No model backend configured. Run `argo setup` in a terminal first.");
      process.exit(1);
    }
    const wrote = await runSetup(repoRoot);
    if (!wrote) return;
    loadEnv(repoRoot); // pick up the freshly written .env
  }
  return runChat(repoRoot, opts);
}

/** Extract a `--resume <id>` value from args, if present. */
function resumeIdFrom(args: string[]): string | undefined {
  const i = args.indexOf("--resume");
  return i >= 0 ? args[i + 1] : undefined;
}

async function runSessionsList(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const sessions = await listSessions(env);
  if (sessions.length === 0) {
    return void console.log("(no saved sessions yet)");
  }
  for (const s of sessions) {
    console.log(`${s.id}  ${s.turns} turn(s)  ${s.title}`);
  }
  console.log("\nResume with: argo resume <id>");
}

function usageExit(): never {
  usage();
  process.exit(1);
}

// Shared run path for run / skill / room. `skillBody` is appended to the prompt;
// `root` is the room's path for a room run (its own kernel data dir + goals).
async function runInstruction(
  repoRoot: string,
  instruction: string,
  opts: { skillBody?: string; root?: string } = {},
): Promise<void> {
  const root = opts.root ?? repoRoot;
  const setup = await prepareRun(root, instruction, opts.skillBody);
  await maybeCurate(); // session-start skill maintenance (best-effort, interval-gated)
  const activeGoals = setup.goals.filter((g) => g.status === "active").length;
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log(`argo · ${setup.provider.modelId()} · ${activeGoals} active goal(s)\n`);
  try {
    const convo = createConversation(setup.systemPrompt, {
      provider: setup.provider,
      safety: setup.safety,
      registry: setup.registry,
      root,
      requestApproval: approver(rl),
      maxIterations: Number(process.env.ARGO_MAX_ITER) || undefined,
      summarize: buildSummarizer(setup.provider),
      ...consoleCallbacks(),
    });
    const outcome = await convo.send(instruction);
    console.log(`\n${outcome.finalText}`);
    console.log(`\n[${outcome.stoppedReason} · ${outcome.iterations} iteration(s)]`);
    await writeRunMemory(setup.provider, setup.goals, instruction, outcome.finalText);
    await suggestSkillFromRun(instruction, process.env);
    await reviewAfterTurn({
      provider: setup.provider,
      safety: setup.safety,
      root,
      transcript: convo.messages,
      toolIterations: outcome.toolIterations,
      turnIndex: 1,
    });
  } finally {
    rl.close();
  }
}

async function runSkillsList(): Promise<void> {
  const skills = await listSkills();
  if (skills.length === 0) return void console.log("(no skills yet — `argo skills install` to add the bundled library)");
  for (const s of skills) console.log(`${s.meta.name} — ${s.meta.description}`);
}

// `argo skills` → list; `argo skills install [--force]` → copy the bundled
// library into ~/.argo/skills (skips existing unless --force).
async function runSkillsCommand(rest: string[]): Promise<void> {
  if (rest[0] !== "install") return runSkillsList();
  const { installed, skipped } = await installSkillLibrary({ force: rest.includes("--force") });
  console.log(
    `Installed ${installed.length} skill(s)${installed.length ? `: ${installed.join(", ")}` : ""}.`,
  );
  if (skipped.length) {
    console.log(`Skipped ${skipped.length} already present (use --force to overwrite): ${skipped.join(", ")}.`);
  }
}

async function runSkillCommand(repoRoot: string, rest: string[]): Promise<void> {
  const [name, ...instr] = rest;
  if (!name) return usageExit();
  const skill = await readSkill(name);
  if (!skill) {
    console.log(`No skill named "${name}".`);
    process.exit(1);
  }
  if (instr.length === 0) return void console.log(`# ${skill.meta.name}\n\n${skill.body}`);
  await runInstruction(repoRoot, instr.join(" "), { skillBody: skill.body });
}

async function runRoomCommand(repoRoot: string, rest: string[]): Promise<void> {
  const [name, ...instr] = rest;
  if (!name) return usageExit();
  const room = await resolveRoomOrExit(name, process.env);
  if (!room) process.exit(1);
  if (instr.length === 0) return void console.log(room.path);
  await runInstruction(repoRoot, instr.join(" "), { root: room.path });
}

const dataDirFor = (repoRoot: string): string => join(repoRoot, ".argo");

// Non-interactive task runner for `argo cron`: approvals denied (no TTY).
function buildCronRunTask(repoRoot: string): RunTask {
  return async (instruction) => {
    const setup = await prepareRun(repoRoot, instruction);
    const outcome = await runAgent(setup.systemPrompt, instruction, {
      provider: setup.provider,
      safety: setup.safety,
      registry: setup.registry,
      root: repoRoot,
      requestApproval: async () => false,
      maxIterations: Number(process.env.ARGO_MAX_ITER) || undefined,
      summarize: buildSummarizer(setup.provider),
    });
    await writeRunMemory(setup.provider, setup.goals, instruction, outcome.finalText);
    return { finalText: outcome.finalText };
  };
}

// `argo gateway` — run the cron scheduler as a foreground daemon (the long-lived
// process that fires scheduled tasks without an external trigger).
async function runGatewayCommand(repoRoot: string): Promise<void> {
  const runTask = buildCronRunTask(repoRoot);
  const token = process.env.ARGO_TELEGRAM_TOKEN;
  const platform = token
    ? new TelegramAdapter({ token, allow: parseAllowlist(process.env.ARGO_TELEGRAM_ALLOW) })
    : undefined;
  const handle = async (text: string): Promise<string> => (await runTask(text)).finalText;

  const port = Number(process.env.ARGO_WEBHOOK_PORT);
  const webhook = port
    ? {
        port,
        secret: process.env.ARGO_WEBHOOK_SECRET,
        prompt: (body: string) =>
          (process.env.ARGO_WEBHOOK_PROMPT ??
            "Handle this inbound webhook event and summarize what happened:\n{body}").replace(
            "{body}",
            body.slice(0, 4000),
          ),
        deliver: resolveDeliver(
          process.env.ARGO_WEBHOOK_DELIVER ?? "local",
          platform ? (chatId, text) => platform.send({ chatId, text }) : undefined,
        ),
      }
    : undefined;

  await runGateway({
    dataDir: dataDirFor(repoRoot),
    run: runTask,
    platform,
    handle,
    webhook,
    tickMs: Number(process.env.ARGO_GATEWAY_TICK_MS) || undefined,
  });
}

// `argo service install|uninstall|status` — manage the background launchd agent.
async function runServiceCommand(repoRoot: string, rest: string[]): Promise<void> {
  const sub = rest[0] ?? "status";
  try {
    if (sub === "install") {
      const path = await installService(repoRoot);
      console.log(`Service installed and loaded: ${path}`);
      console.log(`Logs: ${join(resolveArgoHome(), "gateway.log")}`);
      return;
    }
    if (sub === "uninstall") {
      await uninstallService();
      return void console.log("Service uninstalled.");
    }
    if (sub === "status") {
      const s = await serviceStatus();
      console.log(
        `platform ${s.platform} · installed ${s.installed ? "yes" : "no"} · running ${s.running ? "yes" : "no"}`,
      );
      return void console.log(s.plistPath);
    }
    console.log("Usage: argo service install | uninstall | status");
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const repoRoot = findRepoRoot();
  loadEnv(repoRoot);
  await ensureArgoStore();

  const [cmd, ...rest] = process.argv.slice(2);

  if (cmd === undefined || cmd === "chat")
    return startInteractive(repoRoot, { resumeId: resumeIdFrom(rest) });
  if (cmd === "--resume") return startInteractive(repoRoot, { resumeId: rest[0] });
  if (cmd === "resume") return startInteractive(repoRoot, { resumeId: rest[0] });
  if (cmd === "sessions") return runSessionsList();
  if (cmd === "help" || cmd === "-h" || cmd === "--help") return usage();
  if (cmd === "setup") return void (await runSetup(repoRoot));
  if (cmd === "status" || cmd === "doctor") return runStatus();
  if (cmd === "schedule") {
    const code = await runScheduleCommand(dataDirFor(repoRoot), rest);
    if (code !== 0) usage();
    process.exit(code);
  }
  if (cmd === "cron")
    return runCron(dataDirFor(repoRoot), new Date(), buildCronRunTask(repoRoot));
  if (cmd === "gateway") return runGatewayCommand(repoRoot);
  if (cmd === "service") return runServiceCommand(repoRoot, rest);
  if (cmd === "skills") return runSkillsCommand(rest);
  if (cmd === "skill") return runSkillCommand(repoRoot, rest);
  if (cmd === "rooms") return runRoomsList(process.env);
  if (cmd === "room") return runRoomCommand(repoRoot, rest);
  if (cmd === "modes") return runModes(process.env, rest[0]);
  if (cmd === "auth") process.exit(await runAuthCommand(rest[0]));
  if (cmd === "run" && rest.length > 0) return runInstruction(repoRoot, rest.join(" "));

  usageExit();
}

main().catch((err: unknown) => {
  console.error(`\nargo error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
