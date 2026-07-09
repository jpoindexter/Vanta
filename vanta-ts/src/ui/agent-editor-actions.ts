import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { resolveVantaHome } from "../store/home.js";
import { parseAgentDef } from "../subagent/agent-defs.js";
import { PROVIDER_CATALOG } from "../providers/catalog.js";
import { TEAMMATE_PALETTE, type TeammateColor } from "./teammate-color.js";
import { openInEditor } from "../editor/open.js";

export type EditableAgentSource = "project" | "claude-user" | "vanta-user";

export type EditableAgent = {
  name: string;
  description: string;
  allowTools: string[];
  model: string;
  color: TeammateColor | "";
  systemPrompt: string;
  path: string;
  source: EditableAgentSource;
};

export type AgentEditorData = {
  agents: EditableAgent[];
  toolNames: string[];
  modelChoices: string[];
  colorChoices: readonly TeammateColor[];
};

export type AgentEditorResult =
  | { ok: true; data: AgentEditorData; note: string }
  | { ok: false; error: string };

export function agentEditorDirs(repoRoot: string, env: NodeJS.ProcessEnv = process.env): { dir: string; source: EditableAgentSource }[] {
  const home = env.HOME || homedir();
  return [
    { dir: join(repoRoot, ".claude", "agents"), source: "project" },
    { dir: join(home, ".claude", "agents"), source: "claude-user" },
    { dir: join(resolveVantaHome(env), "agents"), source: "vanta-user" },
  ];
}

export function modelChoices(): string[] {
  const seen = new Set<string>();
  const choices = [""];
  for (const model of PROVIDER_CATALOG.flatMap((p) => [p.defaultModel, ...p.models])) {
    if (!model || seen.has(model)) continue;
    seen.add(model);
    choices.push(model);
  }
  return choices;
}

export async function loadAgentEditorData(repoRoot: string, toolNames: string[], env: NodeJS.ProcessEnv = process.env): Promise<AgentEditorData> {
  const agents: EditableAgent[] = [];
  for (const entry of agentEditorDirs(repoRoot, env)) agents.push(...await readAgentsInDir(entry.dir, entry.source));
  return {
    agents: agents.sort((a, b) => a.name.localeCompare(b.name)),
    toolNames: [...new Set(toolNames)].sort(),
    modelChoices: modelChoices(),
    colorChoices: TEAMMATE_PALETTE,
  };
}

async function readAgentsInDir(dir: string, source: EditableAgentSource): Promise<EditableAgent[]> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const out: EditableAgent[] = [];
  for (const file of files.filter((f) => /\.md$/i.test(f))) {
    const path = join(dir, file);
    try {
      out.push(parseEditableAgent(path, await readFile(path, "utf8"), file.replace(/\.md$/i, ""), source));
    } catch {
      // Skip unreadable files; one bad agent should not break the panel.
    }
  }
  return out;
}

export function parseEditableAgent(path: string, text: string, fallbackName: string, source: EditableAgentSource): EditableAgent {
  const def = parseAgentDef(text, fallbackName);
  const raw = readFrontmatter(text);
  return {
    name: def.name,
    description: def.description,
    allowTools: [...(def.allowTools ?? [])],
    model: def.model ?? "",
    color: parseColor(raw.color),
    systemPrompt: def.systemPrompt,
    path,
    source,
  };
}

function readFrontmatter(text: string): Record<string, string> {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return {};
  const out: Record<string, string> = {};
  for (const line of (match[1] ?? "").split("\n")) {
    const sep = line.indexOf(":");
    if (sep > 0) out[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
  }
  return out;
}

function parseColor(raw: string | undefined): TeammateColor | "" {
  return TEAMMATE_PALETTE.includes(raw as TeammateColor) ? (raw as TeammateColor) : "";
}

export function cycleModel(agent: EditableAgent, choices: readonly string[]): EditableAgent {
  const i = Math.max(0, choices.indexOf(agent.model));
  return { ...agent, model: choices[(i + 1) % choices.length] ?? "" };
}

export function cycleColor(agent: EditableAgent, choices: readonly TeammateColor[] = TEAMMATE_PALETTE): EditableAgent {
  const all: readonly (TeammateColor | "")[] = ["", ...choices];
  const i = Math.max(0, all.indexOf(agent.color));
  return { ...agent, color: all[(i + 1) % all.length] ?? "" };
}

export function toggleTool(agent: EditableAgent, tool: string): EditableAgent {
  const has = agent.allowTools.includes(tool);
  const allowTools = has ? agent.allowTools.filter((t) => t !== tool) : [...agent.allowTools, tool].sort();
  return { ...agent, allowTools };
}

export function serializeEditableAgent(agent: EditableAgent): string {
  const lines = [
    "---",
    `name: ${oneLine(agent.name)}`,
    `description: ${oneLine(agent.description)}`,
    ...(agent.allowTools.length ? [`tools: [${agent.allowTools.join(", ")}]`] : []),
    ...(agent.model ? [`model: ${oneLine(agent.model)}`] : []),
    ...(agent.color ? [`color: ${agent.color}`] : []),
    "---",
    "",
    agent.systemPrompt.trim(),
    "",
  ];
  return lines.join("\n");
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export async function saveAgent(repoRoot: string, agent: EditableAgent, toolNames: string[], env: NodeJS.ProcessEnv = process.env): Promise<AgentEditorResult> {
  try {
    await mkdir(dirname(agent.path), { recursive: true });
    await writeFile(agent.path, serializeEditableAgent(agent), "utf8");
    return { ok: true, data: await loadAgentEditorData(repoRoot, toolNames, env), note: `saved ${agent.name}` };
  } catch (err) {
    return { ok: false, error: `could not save ${agent.name}: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function openAgentFile(agent: EditableAgent, env: NodeJS.ProcessEnv = process.env): Promise<{ ok: boolean; note: string }> {
  const result = await openInEditor(agent.path, env);
  return { ok: result.ok, note: result.message };
}
