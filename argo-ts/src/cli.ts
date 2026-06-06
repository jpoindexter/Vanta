import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { createConversation } from "./agent.js";
import { mirrorLegacyEnv } from "./env-compat.js";
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
  mirrorLegacyEnv(); // back-compat: existing ARGO_* configs → VANTA_*
}

function usage(): void {
  console.log(
    [
      "Usage: argo                              start an interactive session",
      "       argo sessions | resume <id>       list past sessions, or resume one",
      "       argo setup                        first-run wizard: pick a model backend",
      "       argo setup messaging              configure a messaging gateway (Telegram, …)",
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
      "       argo desktop [port]                start local desktop command center",
      "       argo improve                      run one factory cycle (review mode — prints plan)",
      "       argo factory [approve|status]     execute or check the dark factory (autonomy L1-4 via VANTA_AUTONOMY_LEVEL)",
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
  // REPL for resume (TUI v1 doesn't rehydrate), --no-tui, VANTA_NO_TUI, or no TTY.
  const useTui =
    Boolean(process.stdin.isTTY) &&
    !opts.resumeId &&
    !opts.noTui &&
    !process.env.VANTA_NO_TUI;
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
      maxIterations: Number(process.env.VANTA_MAX_ITER) || undefined,
      summarize: buildSummarizer(setup.provider),
      activeGoalText: setup.goals.find((g) => g.status === "active")?.text,
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
  if (rest[0] === "bundle") {
    const { listBundles, readBundle } = await import("./skills/bundle.js");
    const name = rest[1];
    if (!name) {
      const bundles = await listBundles();
      if (!bundles.length) return void console.log("(no bundles yet — create ~/.argo/skill-bundles/<name>.yaml)");
      for (const b of bundles) console.log(`${b.name} — ${b.description} [${b.skills.join(", ")}]`);
      return;
    }
    const cfg = await readBundle(name);
    if (!cfg) { console.log(`No bundle named "${name}".`); process.exit(1); }
    console.log(`Bundle: ${cfg.name}\n  Skills: ${cfg.skills.join(", ")}\n${cfg.instruction ? `  Instruction: ${cfg.instruction}` : ""}`);
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

async function runMemoryCommand(rest: string[]): Promise<void> {
  const sub = rest[0];
  if (sub === "search") {
    const query = rest.slice(1).join(" ").trim();
    if (!query) { console.log("usage: argo memory search <query>"); return; }
    const { searchArchive } = await import("./memory/archive.js");
    const results = await searchArchive(query, { maxResults: 20 });
    if (!results.length) { console.log(`(no archive matches for "${query}")`); return; }
    for (const r of results) console.log(`[${r.sessionId}] ${r.role}: ${r.excerpt}`);
    return;
  }
  console.log("usage: argo memory search <query>");
}

async function runVoiceCommand(repoRoot: string): Promise<void> {
  const setup = await prepareRun(repoRoot, "voice session");
  const { runVoiceLoop } = await import("./voice/loop.js");
  await runVoiceLoop({
    provider: setup.provider,
    safety: setup.safety,
    registry: setup.registry,
    root: repoRoot,
    systemPrompt: setup.systemPrompt,
    durationSec: parseInt(process.env.VANTA_VOICE_DURATION ?? "5", 10) || 5,
  });
}

async function runHooksCommand(rest: string[]): Promise<void> {
  const { homedir } = await import("node:os");
  const { readFile, writeFile, mkdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const settingsPath = join(homedir(), ".claude", "settings.json");
  const argoCmd = join(homedir(), ".local", "bin", "argo");
  if (rest[0] === "run") {
    // Called by Claude Code Stop/PreCompact hooks — write a brain episodic note.
    const event = rest[1] ?? "stop";
    try {
      const { writeRegion } = await import("./brain/store.js");
      const note = `\n- [${new Date().toISOString()}] Claude Code hook: ${event}`;
      await writeRegion("episodic", note, { append: true });
    } catch { /* best-effort */ }
    return;
  }
  if (rest[0] === "status") {
    try {
      const raw = await readFile(settingsPath, "utf8");
      const settings: Record<string, unknown> = JSON.parse(raw);
      const hooks = settings.hooks as Record<string, unknown> | undefined;
      console.log(`hooks.Stop:       ${hooks?.Stop ? "✓ configured" : "✗ not set"}`);
      console.log(`hooks.PreCompact: ${hooks?.PreCompact ? "✓ configured" : "✗ not set"}`);
    } catch {
      console.log("(~/.claude/settings.json not found or not readable)");
    }
    return;
  }
  // install
  await mkdir(join(homedir(), ".claude"), { recursive: true });
  let settings: Record<string, unknown> = {};
  try { settings = JSON.parse(await readFile(settingsPath, "utf8")); } catch { /* new file */ }
  const makeHook = (event: string) => [{
    matcher: "",
    hooks: [{ type: "command", command: `${argoCmd} hooks run ${event} 2>/dev/null &` }],
  }];
  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  hooks.Stop = makeHook("stop");
  hooks.PreCompact = makeHook("precompact");
  settings.hooks = hooks;
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  console.log(`✓ hooks installed in ${settingsPath}`);
  console.log("  Stop + PreCompact → argo hooks run <event>");
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
  if (cmd === "setup") {
    if (rest[0] === "messaging") return void (await runMessagingSetup(repoRoot));
    return void (await runSetup(repoRoot));
  }
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
  if (cmd === "voice") return runVoiceCommand(repoRoot);
  if (cmd === "hooks") return runHooksCommand(rest);
  if (cmd === "mcp") return runMcpCommand(repoRoot, rest);
  if (cmd === "roadmap") return runRoadmapCommand(repoRoot, rest);
  if (cmd === "desktop") return runDesktopCommand(repoRoot, rest);
  if (cmd === "memory") return runMemoryCommand(rest);
  if (cmd === "improve") return runFactoryCommand(repoRoot, "review");
  if (cmd === "factory") return runFactoryCommand(repoRoot, rest[0] ?? "");

  usageExit();
}

main().catch((err: unknown) => {
  console.error(`\nargo error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
