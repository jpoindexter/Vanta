import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { createConversation } from "./agent.js";
import { ensureArgoStore } from "./store/home.js";
import { listSkills, readSkill } from "./skills/store.js";
import { installSkillLibrary } from "./skills/library.js";
import { listSessions } from "./sessions/store.js";
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
import { runTui } from "./tui/launch.js";
import { runSetup } from "./setup.js";
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
} from "./cli/ops.js";

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
      "       argo skills [install [--force]|lint]   list / install bundled / validate SKILL.md files",
      '       argo skill <name> ["<instruction>"]  print a skill, or run with it',
      '       argo schedule "<instruction>" --cron "<expr>" | schedule list',
      "       argo cron                         run due tasks once (for launchd/cron)",
      "       argo gateway                      run the scheduler as a foreground daemon",
      "       argo service [install|uninstall|status]   manage the background launchd agent",
      "       argo rooms | room <name> [\"<instruction>\"]   project rooms",
      "       argo modes [list|install]         operator modes",
      "       argo auth google                  one-time Google OAuth",
      "       argo mcp [list|serve]             list MCP servers Argo consumes, or serve Argo's tools over MCP stdio",
      "       argo roadmap                      build roadmap.html from roadmap.json and open it",
      "       argo roadmap move <id> <status>   move an item (shipped|building|next|horizon)",
      "       argo roadmap serve                start drag-and-drop board at http://localhost:7789/roadmap/board",
      "       argo improve                      run one factory cycle (review mode — prints plan)",
      "       argo factory [approve|status]     execute or check the dark factory (autonomy L1-4 via ARGO_AUTONOMY_LEVEL)",
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
  opts: { resumeId?: string; noTui?: boolean } = {},
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
  // The Ink TUI is the default interactive surface; fall back to the readline
  // REPL for resume (TUI v1 doesn't rehydrate), --no-tui, ARGO_NO_TUI, or no TTY.
  const useTui =
    Boolean(process.stdin.isTTY) &&
    !opts.resumeId &&
    !opts.noTui &&
    !process.env.ARGO_NO_TUI;
  return useTui ? runTui(repoRoot) : runChat(repoRoot, opts);
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
  // Ctrl+C aborts the current run gracefully (between iterations) instead of
  // hard-killing — the loop returns "interrupted" and post-run memory still runs.
  const controller = new AbortController();
  const onSigint = (): void => controller.abort();
  process.once("SIGINT", onSigint);
  try {
    const convo = createConversation(setup.systemPrompt, {
      provider: setup.provider,
      safety: setup.safety,
      registry: setup.registry,
      root,
      requestApproval: approver(rl),
      maxIterations: Number(process.env.ARGO_MAX_ITER) || undefined,
      summarize: buildSummarizer(setup.provider),
      signal: controller.signal,
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
    process.removeListener("SIGINT", onSigint);
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
  if (rest[0] === "lint") {
    const { lintSkills, formatLint } = await import("./skills/lint.js");
    const issues = await lintSkills();
    console.log(formatLint(issues));
    if (issues.some((i) => i.level === "error")) process.exit(1);
    return;
  }
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

async function main(): Promise<void> {
  const repoRoot = findRepoRoot();
  loadEnv(repoRoot);
  await ensureArgoStore();

  const [cmd, ...rest] = process.argv.slice(2);

  if (cmd === undefined || cmd === "chat")
    return startInteractive(repoRoot, {
      resumeId: resumeIdFrom(rest),
      noTui: rest.includes("--no-tui"),
    });
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
  if (cmd === "mcp") return runMcpCommand(repoRoot, rest);
  if (cmd === "roadmap") return runRoadmapCommand(repoRoot, rest);
  if (cmd === "improve") return runFactoryCommand(repoRoot, "review");
  if (cmd === "factory") return runFactoryCommand(repoRoot, rest[0] ?? "");

  usageExit();
}

main().catch((err: unknown) => {
  console.error(`\nargo error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
