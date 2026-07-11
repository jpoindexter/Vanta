import { existsSync } from "node:fs";
import { loadSettings, type Settings } from "../settings/store.js";
import { buildRegistry } from "../tools/index.js";
import { explainToolBoundary } from "../tools/tool-boundary.js";
import type { ToolSchema } from "../providers/interface.js";

type ToolsDeps = {
  env?: NodeJS.ProcessEnv;
  log?: (line: string) => void;
  loadSettings?: (root: string, env: NodeJS.ProcessEnv) => Promise<Settings>;
  schemas?: () => ToolSchema[];
  fileExists?: (path: string) => boolean;
};

export async function runToolsCommand(root: string, args: string[], deps: ToolsDeps = {}): Promise<number> {
  const log = deps.log ?? console.log;
  if (args[0] !== "why" || !args[1]) { log("Usage: vanta tools why <tool>"); return 1; }
  return explain(root, args[1], deps, log);
}

async function explain(root: string, tool: string, deps: ToolsDeps, log: (line: string) => void): Promise<number> {
  const env = deps.env ?? process.env;
  const settings = await (deps.loadSettings ?? loadSettings)(root, env).catch(() => ({}));
  const explanation = explainToolBoundary(tool, {
    schemas: (deps.schemas ?? (() => buildRegistry().schemas()))(), settings,
    profileId: env.VANTA_PROFILE, env, fileExists: deps.fileExists ?? existsSync,
  });
  log(`${explanation.tool} — ${explanation.reason}`);
  log(`typical kernel risk: ${explanation.typicalRisk} (the kernel decides from real arguments per call)`);
  log(`setup: ${explanation.setup}`);
  for (const missing of explanation.missing) log(`missing: ${missing}`);
  if (explanation.warning) log(`warning: ${explanation.warning}`);
  for (const repair of explanation.repairs) log(`repair: ${repair}`);
  return explanation.known ? 0 : 1;
}
