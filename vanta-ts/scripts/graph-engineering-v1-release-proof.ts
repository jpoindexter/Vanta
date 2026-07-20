import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runReleaseProofPhase, verifyGraphV1ReleaseProof } from "../src/workflow/release-proof.js";

const phase = argument("--phase");
const suppliedRoot = argument("--root");

if (phase && suppliedRoot) {
  const result = await runReleaseProofPhase(suppliedRoot, phase === "crash");
  console.log(JSON.stringify(result));
} else {
  await runOrchestrator();
}

async function runOrchestrator(): Promise<void> {
  const projectRoot = await mkdtemp(join(tmpdir(), "vanta-graph-v1-project-"));
  try {
    await writeFile(join(projectRoot, "README.md"), "# Fresh graph proof project\n", "utf8");
    const first = await runChild(projectRoot, "crash");
    if (first.status !== "failed") throw new Error(`forced restart phase ended ${first.status}`);
    const second = await runChild(projectRoot, "resume");
    if (second.status !== "succeeded") throw new Error(`resume phase ended ${second.status}`);
    const summary = await verifyGraphV1ReleaseProof(projectRoot);
    console.log(JSON.stringify(summary));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

async function runChild(projectRoot: string, childPhase: string): Promise<{ status: string; reason: string }> {
  const script = fileURLToPath(import.meta.url);
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", script, "--phase", childPhase, "--root", projectRoot], { cwd: process.cwd() });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || `proof child exited ${code}`)));
  });
  const line = output.trim().split("\n").at(-1);
  if (!line) throw new Error("proof child returned no result");
  return JSON.parse(line) as { status: string; reason: string };
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
