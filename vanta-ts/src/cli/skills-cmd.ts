import { listSkills, readSkill } from "../skills/store.js";
import { installSkillLibrary } from "../skills/library.js";
import { runInstruction } from "./commands.js";
import type { Skill } from "../skills/types.js";

async function runSkillsDistill(rest: string[]): Promise<void> {
  const { distillAll, formatDistillReport } = await import("../skills/distill-all.js");
  const { distillSkill, readDistilled, writeDistilled } = await import("../skills/distill.js");
  const { resolveProvider } = await import("../providers/index.js");

  const arg = rest[1];
  const all = arg === "--all" || arg === undefined;
  if (!all && arg.startsWith("--")) {
    console.log("Usage: vanta skills distill [--all | <skill name>]");
    process.exit(1);
  }

  const skills = await listSkills();
  const targets = (all ? skills : skills.filter((s) => s.meta.name === arg)).map((s) => ({
    name: s.meta.name,
    body: s.body,
  }));
  if (targets.length === 0) {
    console.log(all ? "(no skills installed — `vanta skills install` first)" : `No skill named "${arg}".`);
    process.exit(all ? 0 : 1);
  }

  const provider = resolveProvider(process.env);
  const outcomes = await distillAll({
    list: async () => targets,
    distill: async (t) => distillSkill({ name: t.name, body: t.body, provider }),
    readExisting: async (name) => readDistilled(name),
    writeOut: async (name, content) => writeDistilled(name, content),
  });
  console.log(formatDistillReport(outcomes));
}

async function runSkillsList(): Promise<void> {
  const skills = await listSkills();
  if (skills.length === 0) return void console.log("(no skills yet — `vanta skills install` to add the bundled library)");
  for (const s of skills) console.log(`${s.meta.name} — ${s.meta.description}`);
}

async function runSkillsBundle(rest: string[]): Promise<void> {
  const { listBundles, resolveBundle } = await import("../skills/bundle.js");
  const name = rest[1];
  if (!name) {
    const bundles = await listBundles();
    if (!bundles.length) return void console.log("(no bundles yet — create ~/.vanta/skill-bundles/<name>.yaml)");
    for (const b of bundles) console.log(`${b.name} — ${b.description} [${b.skills.join(", ")}]`);
    return;
  }
  const bundle = await resolveBundle(name);
  if (!bundle) { console.log(`No bundle named "${name}".`); process.exit(1); }
  const missing = bundle.missing.length ? `\n  Missing: ${bundle.missing.join(", ")}` : "";
  console.log(`Bundle: ${bundle.config.name}\n  Skills: ${bundle.config.skills.join(", ")}${missing}\n${bundle.config.instruction ? `  Instruction: ${bundle.config.instruction}` : ""}`);
}

/** SKILL-TRIGGERS — `vanta skills trigger-emit <slug> <event>`: surface a recall
 *  note for the skill, shaped per the event's injection capability. NEVER runs the
 *  skill body or anything irreversible. */
/** Read a JSON payload from stdin (a hook's piped context), or null if none/invalid. */
async function readStdinJson(): Promise<Record<string, unknown> | null> {
  if (process.stdin.isTTY) return null;
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** UserPromptSubmit gate: Claude Code ignores the `matcher` field for this event
 *  (it's tool-name-only), so the hook fires on EVERY prompt — suppress the note
 *  unless the prompt actually matches the trigger's regex. */
async function userPromptGatedOut(skill: Skill, event: string): Promise<boolean> {
  if (event !== "UserPromptSubmit") return false;
  const m = (skill.meta.triggers ?? []).find((t) => t.event === "UserPromptSubmit")?.match;
  if (!m) return false;
  const { promptMatchesTrigger } = await import("../skills/triggers.js");
  const prompt = String((await readStdinJson())?.prompt ?? "");
  return Boolean(prompt) && !promptMatchesTrigger(m, prompt);
}

/** Claude Code emit: read the stdin payload and emit a hookSpecificOutput JSON.
 *  For PreToolUse, the matcher is broad (e.g. "Bash"), so we confirm the command
 *  actually matches the trigger (e.g. contains "git push") before surfacing. */
async function runClaudeEmit(slug: string, event: string, note: string): Promise<void> {
  const { claudeToolMap } = await import("../skills/triggers.js");
  const { readSkill } = await import("../skills/store.js");
  const skill = await readSkill(slug);
  if (!skill) return;
  if (event === "PreToolUse") {
    const trig = (skill.meta.triggers ?? []).find((t) => t.event === "PreToolUse");
    const { inputContains } = claudeToolMap(trig?.match);
    const payload = await readStdinJson();
    const cmd = String((payload?.tool_input as { command?: unknown } | undefined)?.command ?? JSON.stringify(payload?.tool_input ?? ""));
    if (inputContains && !cmd.includes(inputContains)) return; // not this tool — silent
    const out = trig?.action === "block"
      ? { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: note } }
      : { hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: note } };
    return void process.stdout.write(`${JSON.stringify(out)}\n`);
  }
  if (await userPromptGatedOut(skill, event)) return; // gate UserPromptSubmit on the prompt regex
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: note } })}\n`);
}

async function runTriggerEmit(rest: string[]): Promise<void> {
  const [, slug, event] = rest;
  if (!slug || !event) {
    console.error("usage: vanta skills trigger-emit <slug> <event> [--claude]");
    process.exit(1);
  }
  const skill = await readSkill(slug);
  if (!skill) return; // skill removed since sync — no-op (exit 0)
  const { buildTriggerNote } = await import("../skills/triggers.js");
  const note = buildTriggerNote(skill, event);
  if (rest.includes("--claude")) return runClaudeEmit(slug, event, note);
  if (event === "Stop") return void process.stdout.write(`${JSON.stringify({ additionalContext: note })}\n`);
  if (event === "PreToolUse") {
    process.stderr.write(`${note}\n`);
    const blocks = (skill.meta.triggers ?? []).some((t) => t.event === "PreToolUse" && t.action === "block");
    if (blocks) process.exit(2); // hard gate; else advisory (statusMessage already warned)
    return;
  }
  process.stdout.write(`${note}\n`); // UserPromptSubmit + others: Claude injects stdout
}

/** `vanta skills sync-triggers [--claude] [--codex]` — (re)compile every skill's triggers
 *  into ~/.vanta/hooks.json, and optionally ~/.claude/settings.json and ~/.codex/AGENTS.md. */
async function runSyncTriggers(rest: string[]): Promise<void> {
  const { syncSkillTriggers, syncSkillTriggersForClaude, syncSkillTriggersForCodex } = await import("../skills/triggers-sync.js");
  const v = await syncSkillTriggers({ env: process.env });
  console.log(`✓ synced ${v.written} skill-trigger hook(s) → ~/.vanta/hooks.json${v.events.length ? ` (${v.events.join(", ")})` : ""}`);
  if (rest.includes("--claude")) {
    const c = await syncSkillTriggersForClaude({ env: process.env });
    console.log(`✓ synced ${c.written} → ~/.claude/settings.json (PreToolUse · PostToolUseFailure · UserPromptSubmit · Stop)`);
  }
  if (rest.includes("--codex")) {
    const x = await syncSkillTriggersForCodex({ env: process.env });
    console.log(`✓ synced ${x.written} prompt-routing line(s) → ${x.path} (Codex reads AGENTS.md each session — no event hooks)`);
  }
}

async function runSkillsLint(): Promise<void> {
  const { lintSkills, formatLint } = await import("../skills/lint.js");
  const issues = await lintSkills();
  console.log(formatLint(issues));
  if (issues.some((i) => i.level === "error")) process.exit(1);
}

/** Handle a `vanta skills <sub>` subcommand; false when it isn't one (→ install/list). */
async function runSkillsSub(rest: string[]): Promise<boolean> {
  const cmd = rest[0];
  if (cmd === "trigger-emit") { await runTriggerEmit(rest); return true; }
  if (cmd === "sync-triggers") { await runSyncTriggers(rest); return true; }
  if (cmd === "lint") { await runSkillsLint(); return true; }
  if (cmd === "bundle") { await runSkillsBundle(rest); return true; }
  if (cmd === "distill") { await runSkillsDistill(rest); return true; }
  const { runSkillsInterop } = await import("./skills-interop.js");
  return runSkillsInterop(rest); // import / export / hub (agentskills.io)
}

async function runRegistrySubcommand(rest: string[]): Promise<boolean> {
  const cmd = rest[0];
  const selected = ["search", "browse", "view", "approve", "update", "rollback", "remove", "doctor"].includes(cmd ?? "")
    || (cmd === "install" && Boolean(rest[1]) && !rest[1]?.startsWith("--"));
  if (!selected) return false;
  const { runSkillsRegistryCommand } = await import("./skills-registry-cmd.js");
  process.exitCode = await runSkillsRegistryCommand(rest);
  return true;
}

export async function runSkillsCommand(rest: string[]): Promise<void> {
  if (await runRegistrySubcommand(rest)) return;
  if (await runSkillsSub(rest)) return;
  if (rest[0] !== "install") return runSkillsList();
  const { installed, skipped } = await installSkillLibrary({ force: rest.includes("--force") });
  console.log(`Installed ${installed.length} skill(s)${installed.length ? `: ${installed.join(", ")}` : ""}.`);
  if (skipped.length) {
    console.log(`Skipped ${skipped.length} already present (use --force to overwrite): ${skipped.join(", ")}.`);
  }
}

export async function runSkillCommand(repoRoot: string, rest: string[]): Promise<number | void> {
  const { usageExit } = await import("./commands.js");
  const [name, ...instr] = rest;
  if (!name) return usageExit();
  // `vanta skill distill [--all|<name>]` mirrors the plural form (don't treat
  // "distill" as a skill to print/run).
  if (name === "distill") return runSkillsDistill(rest);
  const skill = await readSkill(name);
  if (!skill) return runBundleSkill(repoRoot, name, instr);
  if (instr.length === 0) return void console.log(`# ${skill.meta.name}\n\n${skill.body}`);
  await runInstruction(repoRoot, instr.join(" "), { skillBody: skill.body });
  return 0; // one-shot DONE — a numeric return makes cli.ts process.exit, so MCP child handles
  // don't keep the event loop alive forever (VANTA-ONESHOT-RUN-HANG, same class as `run`).
}

async function runBundleSkill(repoRoot: string, name: string, instr: string[]): Promise<number | void> {
  const { resolveBundle } = await import("../skills/bundle.js");
  const bundle = await resolveBundle(name);
  if (!bundle) { console.log(`No skill or bundle named "${name}".`); process.exit(1); }
  if (bundle.missing.length) {
    console.log(`Bundle "${name}" is missing skill(s): ${bundle.missing.join(", ")}`);
    process.exit(1);
  }
  if (instr.length === 0) return void console.log(bundle.body);
  await runInstruction(repoRoot, instr.join(" "), { skillBody: bundle.body });
  return 0;
}
