import { addAutoWatch, formatAutoWatch, formatWatchChange, loadAutoWatch, runAutoWatch } from "../watch/auto-watch.js";
import { dataDirFor } from "./ops.js";

export async function runAutoWatchCommand(repoRoot: string, rest: string[]): Promise<number> {
  const dataDir = dataDirFor(repoRoot);
  const sub = rest[0] ?? "list";
  if (sub === "list") {
    console.log(formatAutoWatch(await loadAutoWatch(dataDir)));
    return 0;
  }
  if (sub === "run") return runAndPrint(dataDir);
  if (sub === "add") return add(dataDir, rest.slice(1));
  console.error("usage: vanta auto-watch [list|run|add <id> --kind <repo|issue|email|calendar|generic> --risk <low|medium|high> --cmd <cmd> --draft <text>]");
  return 1;
}

async function runAndPrint(dataDir: string): Promise<number> {
  const changes = await runAutoWatch(dataDir);
  if (!changes.length) {
    console.log("auto-watch: no important changes");
    return 0;
  }
  for (const c of changes) console.log(formatWatchChange(c));
  return 0;
}

async function add(dataDir: string, rest: string[]): Promise<number> {
  const id = rest[0];
  const kind = value(rest, "--kind") ?? "generic";
  const risk = value(rest, "--risk") ?? "medium";
  const command = value(rest, "--cmd");
  const draft = value(rest, "--draft") ?? "Review this change and decide the next response.";
  if (!id || !command || !["repo", "issue", "email", "calendar", "generic"].includes(kind) || !["low", "medium", "high"].includes(risk)) {
    console.error("usage: vanta auto-watch add <id> --kind <repo|issue|email|calendar|generic> --risk <low|medium|high> --cmd <cmd> [--draft <text>]");
    return 1;
  }
  const watch = await addAutoWatch(dataDir, { id, kind: kind as never, risk: risk as never, command, draft });
  console.log(`${watch.id} · ${watch.kind} · ${watch.risk} · ${watch.command}`);
  return 0;
}

function value(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  return idx === -1 ? null : args[idx + 1] ?? null;
}
