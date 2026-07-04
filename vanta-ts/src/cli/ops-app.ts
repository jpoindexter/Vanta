import { join } from "node:path";
import { resolveVantaHome } from "../store/home.js";

export async function runDesktopCommand(repoRoot: string, rest: string[]): Promise<void> {
  const port = Number(rest[0] ?? process.env.VANTA_DESKTOP_PORT) || 7790;
  const { serveDesktop } = await import("../desktop/server.js");
  setTimeout(() => {
    void import("node:child_process").then(({ execSync }) => {
      try { execSync(`open "http://127.0.0.1:${port}"`); } catch {}
    });
  }, 300);
  await serveDesktop(repoRoot, port);
}

export async function runFactoryCommand(repoRoot: string, sub: string): Promise<void> {
  const { runCycle, formatCycleLog, resolveAutonomyLevel } = await import("../factory/run.js");
  const budget = Number(process.env.VANTA_FACTORY_BUDGET) || 80_000;
  const dataDir = resolveVantaHome(process.env);

  if (sub === "approve") {
    const autonomyLevel = resolveAutonomyLevel("approve", process.env);
    const result = await runCycle(
      { vantaRoot: repoRoot, dataDir, autonomyLevel, budgetTokens: budget, interactive: true },
      console.log,
    );
    console.log(`\n${formatCycleLog(result)}`);
    return;
  }

  if (sub === "status") {
    const { access, readFile } = await import("node:fs/promises");
    const locked = await access(join(dataDir, "factory.lock")).then(() => true).catch(() => false);
    console.log(locked ? "factory: RUNNING (lockfile present)" : "factory: idle");
    const logDir = join(dataDir, "logs");
    try {
      const { readdirSync } = await import("node:fs");
      const logs = readdirSync(logDir).filter((f: string) => f.startsWith("factory-")).sort().reverse();
      if (logs[0]) {
        const last = await readFile(join(logDir, logs[0]!), "utf8");
        console.log(`last cycle: ${last.trim().split("\n").at(-1) ?? ""}`);
      }
    } catch { /* no logs yet */ }
    return;
  }

  if (sub === "review" || sub === "") {
    const result = await runCycle(
      { vantaRoot: repoRoot, dataDir, autonomyLevel: 1, budgetTokens: budget, interactive: true },
      console.log,
    );
    console.log(`\n${formatCycleLog(result)}`);
    return;
  }

  console.log("Usage: vanta factory [approve|status]");
}

export async function runPairingCommand(rest: string[]): Promise<void> {
  const home = resolveVantaHome();
  const { listPairings, approvePairing } = await import("../gateway/pairing.js");
  const sub = rest[0] ?? "list";

  if (sub === "approve") {
    const chatId = rest[1];
    if (!chatId) { console.error("usage: vanta pairing approve <chatId>"); process.exit(1); }
    const ok = await approvePairing(chatId, "cli", home);
    console.log(ok ? `✓ approved: ${chatId}` : `not found: ${chatId}`);
    return;
  }

  const records = await listPairings(home);
  if (!records.length) { console.log("(no pairing records)"); return; }
  for (const r of records) {
    const age = r.status === "approved"
      ? `approved ${new Date(r.approvedAt ?? r.issuedAt).toISOString()}`
      : `expires ${new Date(r.expiresAt).toISOString()} · ${r.attempts} attempt(s)`;
    console.log(`${r.platform.padEnd(10)} ${r.chatId.padEnd(20)} [${r.status}]  ${age}`);
  }
}

const CONFIG_USAGE = "Usage: vanta config [show | get KEY | set KEY VALUE | edit | check | migrate | revisions | rollback [REV]]";

/** One entry per `vanta config <sub>` subcommand — a data table keeps the
 *  dispatcher's complexity flat as subcommands grow (CODE-SIZE-GATE). */
type ConfigModule = typeof import("../cli-dx/config.js");
const CONFIG_SUBCOMMANDS: Record<string, (m: ConfigModule, repoRoot: string, rest: string[]) => Promise<string | void>> = {
  show: (m, root) => m.showConfig(root),
  edit: (m, root) => m.editConfig(root),
  migrate: (m, root) => m.migrateConfig(root),
  check: (m, root) => m.checkConfig(root),
  get: (m, root, rest) => (rest[1] ? m.getConfig(root, rest[1]) : Promise.resolve("Usage: vanta config get KEY")),
  set: (m, root, rest) =>
    rest[1] && rest[2] !== undefined
      ? m.setConfig(root, rest[1], rest.slice(2).join(" "))
      : Promise.resolve("Usage: vanta config set KEY VALUE"),
  revisions: async (m, root) => m.formatRevisionList(await m.listConfigRevisions(root)),
  rollback: (m, root, rest) => m.rollbackConfig(root, rest[1] ? Number(rest[1]) : undefined),
};

export async function runConfigCommand(repoRoot: string, rest: string[]): Promise<void> {
  const sub = rest[0] ?? "show";
  const m = await import("../cli-dx/config.js");
  const handler = CONFIG_SUBCOMMANDS[sub];
  try {
    const out = handler ? await handler(m, repoRoot, rest) : CONFIG_USAGE;
    if (typeof out === "string") console.log(out);
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
