import { readdirSync, readFileSync } from "node:fs";
import { loadSettings, localSettingsPath, writeSettings, type Settings } from "../settings/store.js";
import { defaultStyleDirs, listOutputStyles, type OutputStyle } from "../prompt/output-styles.js";

export type OutputStyleOption = OutputStyle & { builtin: boolean };
export type OutputStyleData = { active: string; options: OutputStyleOption[] };

const BUILTINS: OutputStyleOption[] = [
  { name: "concise", description: "Short answers, minimal examples.", body: "Reply in 1-2 sentences, omit examples and explanations unless critical.", builtin: true },
  { name: "normal", description: "Balanced default response length.", body: "Reply at normal length with context and examples as needed.", builtin: true },
  { name: "verbose", description: "Full context and examples.", body: "Reply with full context, examples, reasoning, and related considerations.", builtin: true },
];

function customStyles(repoRoot: string, env: NodeJS.ProcessEnv): OutputStyleOption[] {
  const dirs = defaultStyleDirs(repoRoot, env.HOME);
  const styles = listOutputStyles({
    dirs,
    listMd: (dir) => {
      try { return readdirSync(dir).filter((f) => f.endsWith(".md")); } catch { return []; }
    },
    readText: (path) => {
      try { return readFileSync(path, "utf8"); } catch { return null; }
    },
  });
  return styles.map((s) => ({ ...s, builtin: false }));
}

export async function loadOutputStyleData(repoRoot: string, env: NodeJS.ProcessEnv = process.env): Promise<OutputStyleData> {
  const settings = await loadSettings(repoRoot, env);
  const active = env.VANTA_OUTPUT_STYLE ?? settings.ui?.outputStyle ?? "normal";
  const byName = new Map<string, OutputStyleOption>();
  for (const option of [...BUILTINS, ...customStyles(repoRoot, env)]) {
    if (!byName.has(option.name.toLowerCase())) byName.set(option.name.toLowerCase(), option);
  }
  return { active, options: [...byName.values()] };
}

export async function persistOutputStyle(repoRoot: string, style: string, env: NodeJS.ProcessEnv = process.env): Promise<OutputStyleData> {
  const local = await loadSettings(repoRoot, env);
  const next: Settings = { ...local, ui: { ...local.ui, outputStyle: style } };
  await writeSettings(localSettingsPath(repoRoot), next);
  env.VANTA_OUTPUT_STYLE = style;
  return loadOutputStyleData(repoRoot, env);
}
