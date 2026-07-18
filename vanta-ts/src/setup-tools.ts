import { select } from "./term/select.js";
import { askLine } from "./setup.js";
import { setEnv } from "./setup.js";
import { loadSettings, writeSettings, localSettingsPath, type Settings } from "./settings/store.js";

// `vanta setup` → Tools section. Toggle whole toolsets on/off + pick a provider
// for the provider-backed tools (vision · search). Feeds the EXISTING gating
// surface — no new enforcement mechanism:
//   • a disabled toolset's tool names are written to settings.blockedTools
//     (the schema field + isToolBlocked helper that already exist), and its
//     live env kill-switch (e.g. VANTA_BROWSER_DISABLED) is set;
//   • enabling a toolset removes those names and clears the kill-switch;
//   • a provider choice writes the same VANTA_* env var the tool already reads.
// The builder (buildToolsUpdates) is PURE and unit-tested; prompting is separate.

/** A toggleable group of tools. `envOff`, when set, is the live env kill-switch. */
export type Toolset = {
  id: string;
  label: string;
  tools: string[];
  /** Env var that disables this toolset at runtime (set to "1" when off, cleared when on). */
  envOff?: string;
};

/** A provider sub-menu for a provider-backed toolset. */
export type ToolProvider = {
  id: string;
  label: string;
  /** The env var the tool already reads to resolve its provider. */
  env: string;
  options: { label: string; value: string }[];
  custom?: boolean;
};

/** The catalog the wizard renders. Tool names match the real `schema.name`s. */
export const TOOLSETS: Toolset[] = [
  { id: "browser", label: "Browser (navigate · click · screenshot)", tools: ["browser_navigate", "browser_extract", "browser_act", "browser_read", "screenshot"], envOff: "VANTA_BROWSER_DISABLED" },
  { id: "comms", label: "Comms (Gmail · Calendar · Drive)", tools: ["gmail_search", "gmail_read", "gmail_draft", "gmail_send", "calendar_read", "calendar_create", "calendar_update", "drive_read", "drive_create", "drive_update"] },
  { id: "git", label: "Git (status · diff · commit · push)", tools: ["git_status", "git_diff", "git_commit", "git_push", "git_branch", "git_checkout"] },
  { id: "code_exec", label: "Code execution (run python/node/rust)", tools: ["run_code"] },
  { id: "lsp", label: "Code intelligence (LSP diagnostics · go-to-def)", tools: ["lsp_diagnostics", "lsp_definition"] },
  { id: "vision", label: "Vision (describe image · screenshot)", tools: ["describe_image"] },
  { id: "search", label: "Web search + fetch", tools: ["web_search", "web_fetch"] },
];

/** Provider sub-menus for the provider-backed toolsets. */
export const TOOL_PROVIDERS: ToolProvider[] = [
  {
    id: "vision", label: "Vision provider", env: "VANTA_VISION_PROVIDER",
    options: [
      { label: "openai", value: "openai" },
      { label: "anthropic", value: "anthropic" },
      { label: "gemini", value: "gemini" },
    ],
    custom: true,
  },
  {
    id: "search", label: "Search provider", env: "VANTA_SEARCH_PROVIDER",
    options: [
      { label: "Automatic — reliable providers + browser fallback [default]", value: "auto" },
      { label: "Brave browser — keyless", value: "brave_browser" },
      { label: "SearXNG — self-hosted", value: "searxng" },
      { label: "SerpAPI — key", value: "serpapi" },
      { label: "Brave — key", value: "brave" },
      { label: "DuckDuckGo — legacy, often bot-blocked", value: "ddg" },
      { label: "Jina over DuckDuckGo — legacy", value: "jina_ddg" },
    ],
  },
];

/** A toolset is enabled (true) or disabled (false); undefined = leave as-is. */
export type ToolsetSelection = Record<string, boolean | undefined>;
/** Provider id → chosen value (undefined = leave as-is). */
export type ProviderSelection = Record<string, string | undefined>;

export type ToolsSelection = {
  toolsets?: ToolsetSelection;
  providers?: ProviderSelection;
};

/** The updates a selection maps to: a settings patch (blockedTools) + env writes. */
export type ToolsUpdates = {
  settings: Pick<Settings, "blockedTools">;
  env: Record<string, string>;
};

const toolsetById = (id: string): Toolset | undefined => TOOLSETS.find((t) => t.id === id);

/** Apply one toolset decision to the running block-set + env. Pure. */
function applyToolset(id: string, enabled: boolean, blocked: Set<string>, env: Record<string, string>): void {
  const ts = toolsetById(id);
  if (!ts) return;
  for (const name of ts.tools) {
    if (enabled) blocked.delete(name);
    else blocked.add(name);
  }
  if (ts.envOff) env[ts.envOff] = enabled ? "" : "1";
}

/**
 * Pure: map a selection (which toolsets to enable/disable + provider picks) onto
 * the existing gating surface. `current` is the prior blockedTools list so a
 * toggle merges rather than clobbers. Empty selection → empty updates (defaults
 * preserve current behavior: no settings change, no env writes).
 */
export function buildToolsUpdates(selection: ToolsSelection, current: string[] = []): ToolsUpdates {
  const blocked = new Set(current);
  const env: Record<string, string> = {};
  for (const [id, enabled] of Object.entries(selection.toolsets ?? {})) {
    if (enabled === undefined) continue;
    applyToolset(id, enabled, blocked, env);
  }
  for (const [id, value] of Object.entries(selection.providers ?? {})) {
    if (value === undefined || value === "") continue;
    const p = TOOL_PROVIDERS.find((x) => x.id === id);
    if (p) env[p.env] = value;
  }
  return { settings: { blockedTools: [...blocked].sort() }, env };
}

/** Read the persisted blockedTools list (local scope wins). */
async function readBlocked(repoRoot: string): Promise<string[]> {
  const settings = await loadSettings(repoRoot, process.env).catch(() => ({}) as Settings);
  return settings.blockedTools ?? [];
}

/** Prompt: for each toolset ask enable/disable (Esc = leave as-is). */
async function promptToolsets(blocked: Set<string>): Promise<ToolsetSelection> {
  const out: ToolsetSelection = {};
  for (const ts of TOOLSETS) {
    const on = !ts.tools.every((n) => blocked.has(n));
    const i = await select(`  ${ts.label} — currently ${on ? "ON" : "OFF"}`, ["Enable", "Disable", "Leave as-is"], { canBack: true });
    if (i === 0) out[ts.id] = true;
    else if (i === 1) out[ts.id] = false;
  }
  return out;
}

/** Prompt: for each provider-backed toolset ask which provider (Esc = leave). */
async function promptProviders(): Promise<ProviderSelection> {
  const out: ProviderSelection = {};
  for (const p of TOOL_PROVIDERS) {
    const labels = [...p.options.map((o) => o.label), ...(p.custom ? ["↳ custom"] : [])];
    const i = await select(`  ${p.label} (Esc = leave)`, labels, { canBack: true });
    if (i < 0) continue;
    if (p.custom && i === labels.length - 1) {
      const v = await askLine(`  Custom ${p.env}: `);
      if (v) out[p.id] = v;
    } else if (p.options[i]) out[p.id] = p.options[i].value;
  }
  return out;
}

/** Persist the settings patch (merged into the local scope) + env writes. */
async function persistTools(repoRoot: string, updates: ToolsUpdates): Promise<void> {
  const local = await loadSettings(repoRoot, process.env).catch(() => ({}) as Settings);
  await writeSettings(localSettingsPath(repoRoot), { ...local, blockedTools: updates.settings.blockedTools });
  const envWrites = Object.fromEntries(Object.entries(updates.env).filter(([, v]) => v !== ""));
  if (Object.keys(envWrites).length) await setEnv(repoRoot, envWrites);
}

/** Run the Tools section of `vanta setup`: toolset toggles + provider sub-menus. */
export async function runToolsSection(repoRoot: string): Promise<void> {
  console.log("\n  ◆ Tools");
  console.log("  Enable/disable toolsets and pick a provider for the provider-backed tools.");
  const blocked = new Set(await readBlocked(repoRoot));
  const toolsets = await promptToolsets(blocked);
  const providers = await promptProviders();
  if (!Object.keys(toolsets).length && !Object.keys(providers).length) {
    console.log("  Tools left unchanged.");
    return;
  }
  const updates = buildToolsUpdates({ toolsets, providers }, [...blocked]);
  await persistTools(repoRoot, updates);
  const off = TOOLSETS.filter((t) => t.tools.every((n) => updates.settings.blockedTools?.includes(n))).map((t) => t.id);
  console.log(`  ✓ Tools updated${off.length ? ` · disabled: ${off.join(", ")}` : ""}`);
}
