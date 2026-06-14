import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SafetyClient } from "../safety-client.js";

const execAsync = promisify(execFile);

export type Shortcut =
  | { type: "bash"; cmd: string }
  | { type: "memory"; text: string };

/**
 * Returns a Shortcut descriptor when input starts with ! (bash) or # (memory),
 * null for everything else. Trims leading whitespace after the prefix character.
 */
export function parseShortcut(input: string): Shortcut | null {
  if (input.startsWith("!") && input.length > 1) {
    const cmd = input.slice(1).trimStart();
    return cmd ? { type: "bash", cmd } : null;
  }
  if (input.startsWith("#") && input.length > 1) {
    const text = input.slice(1).trimStart();
    return text ? { type: "memory", text } : null;
  }
  return null;
}

/**
 * Runs a shell command in `root`, kernel-assessed first.
 * Block → formatted error. Ask → runs with warning prefix. Allow → runs silently.
 */
export async function runBashShortcut(
  cmd: string,
  safety: SafetyClient,
  root: string,
): Promise<string> {
  const verdict = await safety
    .assess(cmd)
    .catch(() => ({ risk: "allow" as const, needsHuman: false, reason: "" }));
  if (verdict.risk === "block") {
    return `✗ blocked: ${verdict.reason || cmd}`;
  }
  const prefix = verdict.risk === "ask" ? "⚠ risky — " : "";
  try {
    const { stdout, stderr } = await execAsync("sh", ["-c", cmd], {
      cwd: root,
      timeout: 30_000,
    });
    const out = (stdout + stderr).trimEnd();
    return `${prefix}$ ${cmd}\n${out || "(no output)"}`;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `${prefix}✗ ${cmd}\n${msg}`;
  }
}

/** Appends a note to the brain semantic region. */
export async function runMemoryShortcut(
  text: string,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const { writeRegion } = await import("../brain/brain.js");
  await writeRegion("semantic", `- ${text}`, { append: true, env });
  const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
  return `◈ remembered: ${preview}`;
}
