import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { type CodeIntelProvider, type Result, ok, err } from "./provider.js";

// The default CodeIntelProvider adapter: shells out to the installed `codegraph`
// CLI (a standalone component — NOT vendored/imported). This is the ONLY place
// that knows about codegraph; swap it for another engine by writing a sibling
// adapter + one registration line in index.ts. Every call is failure-tolerant:
// a missing binary, missing index, or non-zero exit becomes a Result error, so
// code intelligence degrading never breaks an agent turn.

const run = promisify(execFile);
const TIMEOUT_MS = 20_000;
const MAX_BUFFER = 4 * 1024 * 1024;

async function cg(root: string, args: string[]): Promise<Result<string>> {
  try {
    const { stdout } = await run("codegraph", args, { cwd: root, timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER });
    const out = stdout.trim();
    return ok(out || "(no results)");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/ENOENT/.test(msg)) return err("code intelligence unavailable — the `codegraph` CLI is not installed");
    return err(`code intelligence error: ${msg.split("\n")[0]}`);
  }
}

export function codegraphArgs(op: "context" | "search" | "affected" | "index", input: string | string[] = ""): string[] {
  if (op === "context") return ["explore", String(input)];
  if (op === "search") return ["query", String(input)];
  if (op === "affected") return ["affected", ...(Array.isArray(input) ? input : [String(input)])];
  return ["index"];
}

/** codegraph CLI adapter bound to an operating root. */
export function codegraphProvider(root: string): CodeIntelProvider {
  return {
    id: "codegraph",
    available: async () => {
      try {
        await run("codegraph", ["--version"], { cwd: root, timeout: 5_000 });
        return true;
      } catch {
        return false;
      }
    },
    context: (task) => cg(root, codegraphArgs("context", task)),
    search: (symbol) => cg(root, codegraphArgs("search", symbol)),
    affected: (files) => cg(root, codegraphArgs("affected", files)),
    ensureIndexed: () => cg(root, codegraphArgs("index")),
  };
}
