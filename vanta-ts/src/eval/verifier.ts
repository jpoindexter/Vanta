import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { Check } from "./types.js";

// Deterministic grader for one task, run against the sandbox AFTER the agent turn.
// Runs outside the kernel/agent — it is trusted infra (the reward must not be
// gameable by the thing being scored). Pure given the filesystem.

export type CheckOutcome = { pass: boolean; detail: string };

const SHELL_TIMEOUT_MS = 60_000;

export function runCheck(check: Check, root: string): CheckOutcome {
  if (check.kind === "file_exists") {
    const ok = existsSync(join(root, check.path));
    return { pass: ok, detail: ok ? `${check.path} exists` : `${check.path} missing` };
  }
  if (check.kind === "file_contains") {
    const p = join(root, check.path);
    if (!existsSync(p)) return { pass: false, detail: `${check.path} missing` };
    const ok = readFileSync(p, "utf8").includes(check.text);
    return { pass: ok, detail: ok ? `${check.path} contains expected text` : `${check.path} lacks "${check.text}"` };
  }
  try {
    execSync(check.cmd, { cwd: root, stdio: "pipe", timeout: SHELL_TIMEOUT_MS });
    return { pass: true, detail: `\`${check.cmd}\` exit 0` };
  } catch (e) {
    return { pass: false, detail: `\`${check.cmd}\` failed: ${(e as Error).message.split("\n")[0]}` };
  }
}
