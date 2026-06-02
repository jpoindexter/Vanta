import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { resolveProvider } from "./providers/index.js";
import { SafetyClient } from "./safety-client.js";
import { ensureKernel } from "./kernel-launcher.js";
import { buildRegistry } from "./tools/index.js";
import { buildSystemPrompt } from "./prompt.js";
import { runAgent } from "./agent.js";
import { ensureArgoStore } from "./store/home.js";
import { listSkills, readSkill } from "./skills/store.js";
import { recentMemory, appendMemory } from "./memory/store.js";
import type { LLMProvider } from "./providers/interface.js";
import type { Summarizer } from "./context.js";
import type { Goal } from "./types.js";

function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "Cargo.toml"))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

function loadEnv(repoRoot: string): void {
  const envPath = join(repoRoot, "argo-ts", ".env");
  try {
    process.loadEnvFile(envPath);
  } catch {
    // no .env file — rely on the ambient environment
  }
}

function usage(): void {
  console.log(
    [
      'Usage: argo run "<instruction>"',
      "       argo skills                       list stored skills",
      "       argo skill <name>                 print a skill",
      '       argo skill <name> "<instruction>" run with that skill applied',
    ].join("\n"),
  );
}

function shortArgs(args: Record<string, unknown>): string {
  const s = JSON.stringify(args);
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
}

function firstLine(text: string): string {
  const line = text.split("\n")[0] ?? "";
  return line.length > 100 ? `${line.slice(0, 97)}...` : line;
}

/** Best-effort history compressor passed to the agent loop (see context.ts). */
function buildSummarizer(provider: LLMProvider): Summarizer {
  return async (msgs) =>
    (
      await provider.complete(
        [
          {
            role: "system",
            content:
              "Summarize the following conversation messages into a compact paragraph capturing decisions, findings, and open threads. Be terse.",
          },
          { role: "user", content: JSON.stringify(msgs).slice(0, 12000) },
        ],
        [],
      )
    ).text;
}

/**
 * Record what a run accomplished toward the first active goal. Best-effort: a
 * failure here must never fail the command, so we swallow with a one-line warn.
 */
async function writeRunMemory(
  provider: LLMProvider,
  goals: Goal[],
  instruction: string,
  finalText: string,
): Promise<void> {
  const goal = goals.find((g) => g.status === "active");
  if (!goal) return;
  try {
    const { text } = await provider.complete(
      [
        {
          role: "system",
          content:
            "In 2-3 sentences, summarize what was accomplished toward the goal. Be specific and terse.",
        },
        {
          role: "user",
          content: `Goal: ${goal.text}\n\nInstruction: ${instruction}\n\nResult: ${finalText}`,
        },
      ],
      [],
    );
    await appendMemory(goal.id, text);
  } catch (err: unknown) {
    console.warn(
      `warn: could not write memory: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

type RunSetup = {
  safety: SafetyClient;
  registry: ReturnType<typeof buildRegistry>;
  provider: LLMProvider;
  goals: Goal[];
  systemPrompt: string;
};

/** Ensure the kernel is up and assemble everything a run needs. */
async function prepareRun(repoRoot: string, skillBody?: string): Promise<RunSetup> {
  const baseUrl = process.env.ARGO_KERNEL_URL ?? "http://127.0.0.1:7788";
  const kernelBin = join(repoRoot, "target", "debug", "argo-kernel");
  await ensureKernel({ baseUrl, kernelBin, root: repoRoot });

  const safety = new SafetyClient(baseUrl);
  const registry = buildRegistry();
  const provider = resolveProvider(process.env);
  const goals = await safety.getGoals().catch(() => []);
  const memory = await recentMemory(
    goals.filter((g) => g.status === "active").map((g) => g.id),
  );

  let systemPrompt = await buildSystemPrompt({
    root: repoRoot,
    soulPath: join(repoRoot, "SOUL.md"),
    goals,
    tools: registry.schemas(),
    now: new Date().toISOString(),
    memory,
  });
  if (skillBody) systemPrompt += `\n\nApply this skill:\n${skillBody}`;

  return { safety, registry, provider, goals, systemPrompt };
}

/**
 * The shared run path for both `argo run` and `argo skill <name> "<instr>"`.
 * `skillBody`, when present, is appended to the system prompt so the run applies
 * that skill.
 */
async function runInstruction(
  repoRoot: string,
  instruction: string,
  skillBody?: string,
): Promise<void> {
  const { safety, registry, provider, goals, systemPrompt } = await prepareRun(
    repoRoot,
    skillBody,
  );
  const activeGoals = goals.filter((g) => g.status === "active").length;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const requestApproval = async (action: string, reason: string): Promise<boolean> => {
    const answer = await rl.question(
      `\n[APPROVAL NEEDED] ${action}\nReason: ${reason}\nApprove? (y/n) `,
    );
    return answer.trim().toLowerCase().startsWith("y");
  };

  console.log(`argo · ${provider.modelId()} · ${activeGoals} active goal(s)\n`);

  try {
    const maxIterations = Number(process.env.ARGO_MAX_ITER) || undefined;
    const outcome = await runAgent(systemPrompt, instruction, {
      provider,
      safety,
      registry,
      root: repoRoot,
      requestApproval,
      maxIterations,
      summarize: buildSummarizer(provider),
      onText: (t) => console.log(t),
      onToolCall: (n, a) => console.log(`  → ${n}(${shortArgs(a)})`),
      onToolResult: (n, ok, out) =>
        console.log(`  ${ok ? "✓" : "✗"} ${n}: ${firstLine(out)}`),
    });
    console.log(`\n${outcome.finalText}`);
    console.log(`\n[${outcome.stoppedReason} · ${outcome.iterations} iteration(s)]`);
    await writeRunMemory(provider, goals, instruction, outcome.finalText);
  } finally {
    rl.close();
  }
}

/** `argo skills` — list every stored skill. */
async function runSkillsList(): Promise<void> {
  const skills = await listSkills();
  if (skills.length === 0) {
    console.log("(no skills yet)");
    return;
  }
  for (const s of skills) console.log(`${s.meta.name} — ${s.meta.description}`);
}

/** `argo skill <name>` (no instruction) — print one skill. */
async function runSkillShow(name: string): Promise<void> {
  const skill = await readSkill(name);
  if (!skill) {
    console.log(`No skill named "${name}".`);
    return;
  }
  console.log(`# ${skill.meta.name}\n\n${skill.body}`);
}

async function main(): Promise<void> {
  const repoRoot = findRepoRoot();
  loadEnv(repoRoot);
  await ensureArgoStore();

  const [cmd, ...rest] = process.argv.slice(2);

  if (cmd === "skills") {
    await runSkillsList();
    return;
  }

  if (cmd === "skill") {
    const [name, ...instr] = rest;
    if (!name) {
      usage();
      process.exit(1);
    }
    if (instr.length === 0) {
      await runSkillShow(name);
      return;
    }
    const skill = await readSkill(name);
    if (!skill) {
      console.log(`No skill named "${name}".`);
      process.exit(1);
    }
    await runInstruction(repoRoot, instr.join(" "), skill.body);
    return;
  }

  if (cmd !== "run" || rest.length === 0) {
    usage();
    process.exit(cmd ? 1 : 0);
  }

  await runInstruction(repoRoot, rest.join(" "));
}

main().catch((err: unknown) => {
  console.error(`\nargo error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
