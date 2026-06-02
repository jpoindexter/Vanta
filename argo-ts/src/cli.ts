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
  console.log('Usage: argo run "<instruction>"');
}

function shortArgs(args: Record<string, unknown>): string {
  const s = JSON.stringify(args);
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
}

function firstLine(text: string): string {
  const line = text.split("\n")[0] ?? "";
  return line.length > 100 ? `${line.slice(0, 97)}...` : line;
}

async function main(): Promise<void> {
  const repoRoot = findRepoRoot();
  loadEnv(repoRoot);

  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd !== "run" || rest.length === 0) {
    usage();
    process.exit(cmd ? 1 : 0);
  }

  const instruction = rest.join(" ");
  const baseUrl = process.env.ARGO_KERNEL_URL ?? "http://127.0.0.1:7788";
  const kernelBin = join(repoRoot, "target", "debug", "argo-kernel");

  await ensureKernel({ baseUrl, kernelBin, root: repoRoot });

  const safety = new SafetyClient(baseUrl);
  const registry = buildRegistry();
  const provider = resolveProvider(process.env);
  const goals = await safety.getGoals().catch(() => []);
  const activeGoals = goals.filter((g) => g.status === "active").length;

  const systemPrompt = await buildSystemPrompt({
    root: repoRoot,
    soulPath: join(repoRoot, "SOUL.md"),
    goals,
    tools: registry.schemas(),
    now: new Date().toISOString(),
  });

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
      onText: (t) => console.log(t),
      onToolCall: (n, a) => console.log(`  → ${n}(${shortArgs(a)})`),
      onToolResult: (n, ok, out) =>
        console.log(`  ${ok ? "✓" : "✗"} ${n}: ${firstLine(out)}`),
    });
    console.log(`\n${outcome.finalText}`);
    console.log(`\n[${outcome.stoppedReason} · ${outcome.iterations} iteration(s)]`);
  } finally {
    rl.close();
  }
}

main().catch((err: unknown) => {
  console.error(`\nargo error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
