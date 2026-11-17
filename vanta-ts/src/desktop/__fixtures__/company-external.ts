import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeSpawn, type FakePlan } from "../../worker-runtimes/__fixtures__/fake-spawn.js";
import type { ProbeFn } from "../../worker-runtimes/probe.js";
import type { RuntimeSeams } from "../company-run-select.js";
import { COMPANY_SID, type CompanyHarness } from "./company-harness.js";

// Test kit for ticket dispatch to external CLI workers: a fake CLI process that
// replays recorded output, fake detection, and a stand-in kernel. Everything else
// (stores, routes, approval flow, run engine, registry, launch gate) is real.

export type ExternalKit = { seams: RuntimeSeams; launches: ReturnType<typeof fakeSpawn>["launches"]; assessed: string[] };

export function externalKit(plan: FakePlan, opts: { auth?: "ok" | "signed-out"; installed?: boolean; verdict?: "allow" | "ask" | "block" } = {}): ExternalKit {
  const fake = fakeSpawn(plan);
  const assessed: string[] = [];
  const probe: ProbeFn = async (_cmd, args) => (args[0] === "--version"
    ? { code: 0, stdout: "2.1.222 (Claude Code)\n", missing: false }
    : { code: opts.auth === "signed-out" ? 1 : 0, stdout: "", missing: false });
  return {
    launches: fake.launches,
    assessed,
    seams: {
      spawnFactory: fake.factory,
      probe,
      kernel: { assess: async (action) => { assessed.push(action); return { risk: opts.verdict ?? "allow" }; } },
    },
  };
}

/** Put empty `claude` and `codex` executables on the session's PATH so detection finds them without the real CLIs. */
export function installFakeClis(h: CompanyHarness, names: string[] = ["claude", "codex"]): void {
  const bin = mkdtempSync(join(tmpdir(), "vanta-fake-bin-"));
  for (const name of names) {
    writeFileSync(join(bin, name), "#!/bin/sh\nexit 0\n");
    chmodSync(join(bin, name), 0o755);
  }
  h.sessions.get(COMPANY_SID)!._env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` };
}

export function initProjectRepo(root: string): void {
  const git = (...args: string[]): void => { execFileSync("git", args, { cwd: root, stdio: "ignore" }); };
  mkdirSync(root, { recursive: true });
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  writeFileSync(join(root, "README.md"), "# project\n");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
}

export type Approval = { id: string; action: string; reason: string; toolName?: string; request: { canRemember?: boolean; sections: Array<{ label: string; value: string }> } };

/** Wait for the next approval card the owner would see. */
export async function nextApproval(h: CompanyHarness): Promise<Approval> {
  for (let attempt = 0; attempt < 500; attempt++) {
    const card = (await h.get("/api/approval")).body as Approval | null;
    if (card) return card;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("no approval card appeared");
}

export async function answerApproval(h: CompanyHarness, id: string, decision: "allow" | "always" | "deny" | "never"): Promise<void> {
  const reply = await h.post("/api/approval", { id, decision });
  if (reply.status !== 200) throw new Error(`approval answer failed: ${JSON.stringify(reply.body)}`);
}
