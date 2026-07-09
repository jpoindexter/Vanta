import { readFile, stat } from "node:fs/promises";
import { diagnoseCrashLog, formatCrashDiagnosis, GREG_UITESTS_CRASH_FIXTURE } from "../diagnose/crash.js";

export async function runCrashDiagnoseCommand(rest: string[] = []): Promise<number> {
  const input = await readCrashInput(rest);
  if (!input.trim()) {
    console.error("usage: vanta diagnose-crash [--demo greg-uitests | <file> | - | <pasted report>]");
    return 1;
  }
  const diagnosis = diagnoseCrashLog(input);
  console.log(formatCrashDiagnosis(diagnosis));
  return diagnosis.kind === "unknown" ? 1 : 0;
}

async function readCrashInput(rest: string[]): Promise<string> {
  if (rest[0] === "--demo") return rest[1] === "greg-uitests" || !rest[1] ? GREG_UITESTS_CRASH_FIXTURE : "";
  if (rest[0] === "-") return readStdin();
  if (!rest.length) return process.stdin.isTTY ? "" : readStdin();
  if (rest.length === 1 && await isFile(rest[0]!)) return readFile(rest[0]!, "utf8");
  return rest.join(" ");
}

async function isFile(path: string): Promise<boolean> {
  return stat(path).then((s) => s.isFile(), () => false);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  return Buffer.concat(chunks).toString("utf8");
}
