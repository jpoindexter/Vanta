import { createInterface } from "node:readline/promises";
import { createConversation } from "../agent.js";
import { listSkills, readSkill } from "../skills/store.js";
import { installSkillLibrary } from "../skills/library.js";
import { listSessions } from "../sessions/store.js";
import { resolveRoomOrExit, suggestSkillFromRun } from "../projects/commands.js";
import {
  prepareRun,
  buildSummarizer,
  writeRunMemory,
  approver,
  reviewAfterTurn,
  maybeCurate,
} from "../session.js";
import { loadSchema, sendWithSchemaRetry } from "../output/json-schema.js";
import { runLifecycleHooks, type LifecycleFlags } from "./lifecycle.js";
import { buildCallbacks } from "./output-callbacks.js";

// The `vanta <command>` handlers, extracted from cli.ts so the entry point stays
// a thin dispatcher (CODE-SIZE-GATE). cli.ts keeps only bootstrap + the
// interactive launch + the COMMANDS table.

export function usage(): void {
  console.log(
    [
      "Usage: vanta                              start an interactive session",
      "       vanta --init | --init-only | --maintenance   run lifecycle bootstrap hooks",
      "       vanta sessions | resume <id> [--fork-session]   list, resume, or fork a session",
      "       vanta setup                        complete guided wizard: model, messaging, MCP, personality, health",
      "       vanta setup model                  just the model/provider picker",
      "       vanta setup messaging              configure a messaging gateway (Telegram, …)",
      "       vanta config <get|set|edit|check>  manage settings (~/.vanta/config.json; secrets → .env)",
      "       vanta status | doctor              health check (kernel, provider, keys, store)",
      '       vanta run "<instruction>"          run one instruction and exit',
      "       vanta skills [install [--force]|lint]   list / install bundled / validate SKILL.md files",
      '       vanta skill <name> ["<instruction>"]  print a skill, or run with it',
      '       vanta schedule "<instruction>" --cron "<expr>" | schedule list',
      "       vanta cron                         run due tasks once (for launchd/cron)",
      "       vanta gateway                      run the scheduler as a foreground daemon",
      "       vanta service [install|uninstall|status]   manage the background launchd agent",
      "       vanta rooms | room <name> [\"<instruction>\"]   project rooms",
      "       vanta modes [list|install]         operator modes",
      "       vanta auth google                  one-time Google OAuth",
      "       vanta mcp [list|serve]             list MCP servers Vanta consumes, or serve Vanta's tools over MCP stdio",
      "       vanta roadmap                      build roadmap.html from roadmap.json and open it",
      "       vanta roadmap move <id> <status>   move an item (shipped|building|next|horizon)",
      "       vanta roadmap serve                start drag-and-drop board at http://localhost:7789/roadmap/board",
      "       vanta desktop [port]                start local desktop command center",
      "       vanta audit                        npm + cargo dependency security scan",
      "       vanta lint [files|--staged]        code-size gate: file≤300 fn≤50 params≤4 complexity≤10",
      "       vanta model [list | <provider> [<model>]]  show or switch the active provider/model",
      "       vanta pairing [list | approve <chatId>]  manage messaging platform pairings",
      "       vanta update [--rollback]              pull latest + rebuild; --rollback restores last snapshot",
      "       vanta open <file[:line]>           open a file:line in your editor",
      "       vanta prompt-size                  per-turn token breakdown (prompt + tool schemas)",
      "       vanta completion [bash|zsh|fish]   print a shell completion script",
      "       vanta backup [out.tgz] | import <in.tgz>   archive / restore ~/.vanta",
      "       vanta improve                      run one factory cycle (review mode — prints plan)",
      "       vanta factory [approve|status]     execute or check the dark factory (autonomy L1-4 via VANTA_AUTONOMY_LEVEL)",
    ].join("\n"),
  );
}

export function usageExit(): never {
  usage();
  process.exit(1);
}

export async function runSessionsList(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const sessions = await listSessions(env);
  if (sessions.length === 0) return void console.log("(no saved sessions yet)");
  for (const s of sessions) console.log(`${s.id}  ${s.turns} turn(s)  ${s.title}`);
  console.log("\nResume with: vanta resume <id>");
}

export type OutputFormat = "text" | "json" | "stream-json";

/** Emit the final result in the requested format. Pure: no side-effects besides stdout. */
function emitOutput(format: OutputFormat, finalText: string, modelId: string): void {
  if (format === "json") {
    console.log(JSON.stringify({ text: finalText, model: modelId }));
  } else if (format === "stream-json") {
    console.log(JSON.stringify({ type: "done", text: finalText }));
  } else {
    console.log(`\n${finalText}`);
  }
}

export async function runInstruction(
  repoRoot: string,
  instruction: string,
  opts: { skillBody?: string; root?: string; outputFormat?: OutputFormat; jsonSchema?: string; lifecycle?: LifecycleFlags } = {},
): Promise<void> {
  const format: OutputFormat = opts.outputFormat ?? "text";
  const structured = format !== "text";
  const root = opts.root ?? repoRoot;
  if (opts.lifecycle && await runLifecycleHooks(root, opts.lifecycle, "one-shot")) return;
  const schema = loadSchema(opts.jsonSchema ?? process.env.VANTA_JSON_SCHEMA);
  const setup = await prepareRun(root, instruction, opts.skillBody);
  await maybeCurate(); // session-start skill maintenance (best-effort, interval-gated)
  const activeGoals = setup.goals.filter((g) => g.status === "active").length;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  if (!structured) console.log(`vanta · ${setup.provider.modelId()} · ${activeGoals} active goal(s)\n`);
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
      ...buildCallbacks(format),
    });
    const outcome = schema ? await sendWithSchemaRetry(convo, instruction, schema) : await convo.send(instruction);
    emitOutput(format, outcome.finalText, setup.provider.modelId());
    if (!structured) console.log(`\n[${outcome.stoppedReason} · ${outcome.iterations} iteration(s)]`);
    await writeRunMemory({ provider: setup.provider, goals: setup.goals, instruction, finalText: outcome.finalText });
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
  if (skills.length === 0) return void console.log("(no skills yet — `vanta skills install` to add the bundled library)");
  for (const s of skills) console.log(`${s.meta.name} — ${s.meta.description}`);
}

async function runSkillsBundle(rest: string[]): Promise<void> {
  const { listBundles, readBundle } = await import("../skills/bundle.js");
  const name = rest[1];
  if (!name) {
    const bundles = await listBundles();
    if (!bundles.length) return void console.log("(no bundles yet — create ~/.vanta/skill-bundles/<name>.yaml)");
    for (const b of bundles) console.log(`${b.name} — ${b.description} [${b.skills.join(", ")}]`);
    return;
  }
  const cfg = await readBundle(name);
  if (!cfg) { console.log(`No bundle named "${name}".`); process.exit(1); }
  console.log(`Bundle: ${cfg.name}\n  Skills: ${cfg.skills.join(", ")}\n${cfg.instruction ? `  Instruction: ${cfg.instruction}` : ""}`);
}

// `vanta skills` → list; `vanta skills install [--force]` → copy the bundled
// library into ~/.vanta/skills (skips existing unless --force).
export async function runSkillsCommand(rest: string[]): Promise<void> {
  if (rest[0] === "lint") {
    const { lintSkills, formatLint } = await import("../skills/lint.js");
    const issues = await lintSkills();
    console.log(formatLint(issues));
    if (issues.some((i) => i.level === "error")) process.exit(1);
    return;
  }
  if (rest[0] === "bundle") return runSkillsBundle(rest);
  if (rest[0] !== "install") return runSkillsList();
  const { installed, skipped } = await installSkillLibrary({ force: rest.includes("--force") });
  console.log(`Installed ${installed.length} skill(s)${installed.length ? `: ${installed.join(", ")}` : ""}.`);
  if (skipped.length) {
    console.log(`Skipped ${skipped.length} already present (use --force to overwrite): ${skipped.join(", ")}.`);
  }
}

async function runMemoryForget(rest: string[]): Promise<void> {
  const { pruneStaleBlocks, getMemoryFootprint, formatForgetSummary } = await import("../memory/forget.js");
  const { memoriesDir } = await import("../store/home.js");
  const { readdir } = await import("node:fs/promises");
  const { existsSync } = await import("node:fs");
  const ttlDays = rest[1] ? Number(rest[1]) : undefined;
  const dir = memoriesDir(process.env);
  if (!existsSync(dir)) { console.log("(no memories yet)"); return; }
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md") && !f.endsWith(".archived.md"));
  if (!files.length) { console.log("(no memory files)"); return; }
  const before = await getMemoryFootprint(process.env);
  const results = await Promise.all(files.map((f) => pruneStaleBlocks(f.replace(/\.md$/, ""), process.env, { ttlDays })));
  const after = await getMemoryFootprint(process.env);
  console.log(formatForgetSummary(results, before, after));
}

export async function runMemoryCommand(rest: string[]): Promise<void> {
  const sub = rest[0];
  if (sub === "search") {
    const query = rest.slice(1).join(" ").trim();
    if (!query) { console.log("usage: vanta memory search <query>"); return; }
    const { searchArchive } = await import("../memory/archive.js");
    const results = await searchArchive(query, { maxResults: 20 });
    if (!results.length) { console.log(`(no archive matches for "${query}")`); return; }
    for (const r of results) console.log(`[${r.sessionId}] ${r.role}: ${r.excerpt}`);
    return;
  }
  if (sub === "forget") return runMemoryForget(rest);
  if (sub === "footprint") {
    const { getMemoryFootprint } = await import("../memory/forget.js");
    const fp = await getMemoryFootprint(process.env);
    console.log(`memory footprint: ${fp.goals} goal(s), ${fp.totalBytes} bytes`);
    for (const f of fp.files) console.log(`  goal ${f.goalId}: ${f.bytes}B, ${f.blocks} block(s)`);
    return;
  }
  console.log("usage: vanta memory search <query> | vanta memory forget [ttl-days] | vanta memory footprint");
}

export async function runVoiceCommand(repoRoot: string): Promise<void> {
  const setup = await prepareRun(repoRoot, "voice session");
  const { runVoiceLoop } = await import("../voice/loop.js");
  await runVoiceLoop({
    provider: setup.provider,
    safety: setup.safety,
    registry: setup.registry,
    root: repoRoot,
    systemPrompt: setup.systemPrompt,
    durationSec: parseInt(process.env.VANTA_VOICE_DURATION ?? "5", 10) || 5,
  });
}

export async function runHooksCommand(rest: string[]): Promise<void> {
  const { homedir } = await import("node:os");
  const { readFile, writeFile, mkdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const settingsPath = join(homedir(), ".claude", "settings.json");
  const vantaCmd = join(homedir(), ".local", "bin", "vanta");
  if (rest[0] === "run") {
    // Called by external Stop/PreCompact hooks — write a brain episodic note.
    const event = rest[1] ?? "stop";
    try {
      const { writeRegion } = await import("../brain/brain.js");
      const note = `\n- [${new Date().toISOString()}] hook: ${event}`;
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
    hooks: [{ type: "command", command: `${vantaCmd} hooks run ${event} 2>/dev/null &` }],
  }];
  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  hooks.Stop = makeHook("stop");
  hooks.PreCompact = makeHook("precompact");
  settings.hooks = hooks;
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  console.log(`✓ hooks installed in ${settingsPath}`);
  console.log("  Stop + PreCompact → vanta hooks run <event>");
}

export async function runSkillCommand(repoRoot: string, rest: string[]): Promise<void> {
  const [name, ...instr] = rest;
  if (!name) return usageExit();
  const skill = await readSkill(name);
  if (!skill) { console.log(`No skill named "${name}".`); process.exit(1); }
  if (instr.length === 0) return void console.log(`# ${skill.meta.name}\n\n${skill.body}`);
  await runInstruction(repoRoot, instr.join(" "), { skillBody: skill.body });
}

export async function runRoomCommand(repoRoot: string, rest: string[]): Promise<void> {
  const [name, ...instr] = rest;
  if (!name) return usageExit();
  const room = await resolveRoomOrExit(name, process.env);
  if (!room) process.exit(1);
  if (instr.length === 0) return void console.log(room.path);
  await runInstruction(repoRoot, instr.join(" "), { root: room.path });
}
