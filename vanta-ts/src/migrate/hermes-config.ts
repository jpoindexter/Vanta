import { redactForLog } from "../store/redact-structural.js";
import type { McpServer, ModelConfig } from "./parse.js";
import {
  parseYamlBlock,
  readSection,
  splitEntries,
  toYamlLines,
  YamlSubsetError,
  type YamlNode,
} from "./yaml-subset.js";

// Maps the `mcp_servers` and `model` sections of a Hermes config.yaml onto Vanta's
// MCP server shape and model setting. Only fields with a safe Vanta equivalent are
// mapped; every other field is returned in `skipped` so the preview can say so.
//
// Secrets: a literal credential in `env` or `headers` is never copied. An env
// entry becomes a `${NAME}` reference (Vanta resolves those from the launching
// environment, mount-config.ts resolveDeclaredMcpEnv), so the operator supplies
// the value themselves. Nothing here grants trust: imported servers still go
// through the normal trust prompt and package guard when they launch.

export type SkippedField = { item: string; reason: string };
export type HermesYamlImport = {
  mcp: Record<string, McpServer>;
  model: ModelConfig | null;
  skipped: SkippedField[];
  /** Which sections the file actually contained, so callers only report what applies. */
  sections: { mcp: boolean; model: boolean };
};

/** Hermes provider id → Vanta provider id, for providers Vanta has under the same meaning. */
const PROVIDER_MAP: Readonly<Record<string, string>> = {
  openai: "openai",
  anthropic: "anthropic",
  openrouter: "openrouter",
  gemini: "gemini",
  ollama: "ollama",
  nvidia: "nvidia",
  "openai-codex": "codex",
};

const ENV_REF = /^\$\{(?:env:)?([A-Za-z_][A-Za-z0-9_]*)\}$/;
// Vanta only resolves whole-value references to upper-case names.
const VANTA_REF_NAME = /^[A-Z_][A-Z0-9_]*$/;
const SECRET_NAME = /key|token|secret|passw|credential|auth|cookie|bearer/i;
const MAPPED_KEYS = new Set(["command", "args", "env", "url", "headers", "enabled", "tools"]);

const isMap = (node: YamlNode | undefined): node is { [key: string]: YamlNode } =>
  typeof node === "object" && node !== null && !Array.isArray(node);
const isStringList = (node: YamlNode | undefined): node is string[] => Array.isArray(node) && node.every((n) => typeof n === "string");
const looksSecret = (name: string, value: string): boolean => SECRET_NAME.test(name) || redactForLog(value) !== value;

type Ctx = { server: string; skipped: SkippedField[] };
const skip = (ctx: Ctx, field: string, reason: string): void => void ctx.skipped.push({ item: `mcp_servers.${ctx.server}.${field}`, reason });

/** One env entry → its Vanta value, or undefined when it is dropped (with a reported reason). */
function mapEnvEntry(name: string, value: string, ctx: Ctx): string | undefined {
  const ref = ENV_REF.exec(value)?.[1];
  const canRef = VANTA_REF_NAME.test(name);
  if (ref && VANTA_REF_NAME.test(ref)) return `\${${ref}}`;
  if (ref || value.includes("${")) return void skip(ctx, `env.${name}`, "reference form Vanta cannot resolve (use a whole-value ${UPPER_CASE_NAME}); not copied");
  if (!looksSecret(name, value)) return value;
  skip(ctx, `env.${name}`, canRef ? `literal secret not copied; mapped to \${${name}}, set ${name} in your environment` : "literal secret not copied");
  return canRef ? `\${${name}}` : undefined;
}

function mapEnv(env: YamlNode | undefined, ctx: Ctx): Record<string, string> | undefined {
  if (!isMap(env)) return undefined;
  const out: Record<string, string> = {};
  for (const [name, raw] of Object.entries(env)) {
    const mapped = mapEnvEntry(name, typeof raw === "string" ? raw : "", ctx);
    if (mapped !== undefined) out[name] = mapped;
  }
  return Object.keys(out).length ? out : undefined;
}

function mapHeaders(headers: YamlNode | undefined, ctx: Ctx): Record<string, string> | undefined {
  if (!isMap(headers)) return undefined;
  const out: Record<string, string> = {};
  for (const [name, raw] of Object.entries(headers)) {
    const value = typeof raw === "string" ? raw : "";
    const refs = [...value.matchAll(/\$\{(?:env:)?([^}]*)\}/g)].map((m) => m[1]!);
    if (refs.length && refs.every((r) => VANTA_REF_NAME.test(r))) out[name] = value.replace(/\$\{env:/g, "${");
    else if (value.includes("${")) skip(ctx, `headers.${name}`, "reference form Vanta cannot resolve; not copied");
    else if (looksSecret(name, value)) skip(ctx, `headers.${name}`, "literal secret not copied; add the header in ~/.vanta/mcp.json, or export VANTA_MCP_TOKEN_<SERVER> for a bearer token");
    else out[name] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

function mapTools(tools: YamlNode | undefined, ctx: Ctx): string[] | undefined {
  if (!isMap(tools)) return undefined;
  for (const key of Object.keys(tools).filter((k) => k !== "include")) skip(ctx, `tools.${key}`, "no Vanta equivalent (Vanta filters tools with an allowlist only)");
  const include = typeof tools.include === "string" ? [tools.include] : tools.include;
  if (!isStringList(include) || !include.length) return undefined;
  if (include.some((name) => /[*?[]/.test(name))) { skip(ctx, "tools.include", "contains glob patterns; Vanta's allowlist takes exact tool names, so all tools stay enabled"); return undefined; }
  return include;
}

type Launch = { command?: string; args?: string[]; url?: string };

/** Command, args and url, or null (reported) when they cannot be imported safely. */
function mapLaunch(node: { [key: string]: YamlNode }, ctx: Ctx): Launch | null {
  const command = typeof node.command === "string" ? node.command : undefined;
  const url = typeof node.url === "string" ? node.url : undefined;
  const args = isStringList(node.args) ? node.args : undefined;
  const refusal = launchRefusal({ node, command, url, args });
  if (refusal) { skip(ctx, refusal.field, refusal.reason); return null; }
  return { ...(command ? { command } : {}), ...(args ? { args } : {}), ...(url ? { url } : {}) };
}

function launchRefusal(l: { node: { [key: string]: YamlNode }; command?: string; url?: string; args?: string[] }): { field: string; reason: string } | null {
  if (l.node.args !== undefined && !l.args) return { field: "args", reason: "not a list of strings; server skipped" };
  const unsafe = [l.command, l.url, ...(l.args ?? [])].find((v) => v !== undefined && (v.includes("${") || redactForLog(v) !== v));
  if (unsafe !== undefined) return { field: "(launch)", reason: "command, args or url contain a reference or credential Vanta cannot resolve; server skipped" };
  if (l.url && !/^https?:\/\//i.test(l.url)) return { field: "url", reason: "not an http(s) URL; server skipped" };
  if (!l.command && !l.url) return { field: "(entry)", reason: "needs a command or a url; server skipped" };
  return null;
}

const isDisabled = (node: { [key: string]: YamlNode }): boolean => typeof node.enabled === "string" && /^(false|no|off)$/i.test(node.enabled);

function reportUnmapped(node: { [key: string]: YamlNode }, ctx: Ctx): void {
  for (const key of Object.keys(node).filter((k) => !MAPPED_KEYS.has(k))) {
    skip(ctx, key, key === "auth" ? "OAuth tokens are never copied; re-authorize in Vanta with mcp_auth" : "no Vanta equivalent; not imported");
  }
}

/** One server → Vanta spec, or null when it cannot be imported safely. */
function mapServer(name: string, node: YamlNode | undefined, skipped: SkippedField[]): McpServer | null {
  const ctx: Ctx = { server: name, skipped };
  if (!isMap(node)) { skip(ctx, "(entry)", "not a mapping; server skipped"); return null; }
  if (isDisabled(node)) { skip(ctx, "enabled", "disabled in the source; server not imported"); return null; }
  reportUnmapped(node, ctx);
  const launch = mapLaunch(node, ctx);
  if (!launch) return null;
  const env = mapEnv(node.env, ctx);
  const headers = mapHeaders(node.headers, ctx);
  const tools = mapTools(node.tools, ctx);
  return { ...launch, ...(env ? { env } : {}), ...(headers ? { headers } : {}), ...(tools ? { tools } : {}) };
}

function mapMcp(lines: ReturnType<typeof toYamlLines>, skipped: SkippedField[]): { servers: Record<string, McpServer>; present: boolean } {
  const section = readSection(lines, "mcp_servers");
  if (section.kind !== "block") return { servers: {}, present: false };
  const servers: Record<string, McpServer> = {};
  for (const entry of splitEntries(section.lines)) {
    try {
      const parsed = parseYamlBlock(entry.lines);
      const mapped = mapServer(entry.name, isMap(parsed) ? parsed[entry.name] : undefined, skipped);
      if (mapped) servers[entry.name] = mapped;
    } catch (error) {
      if (!(error instanceof YamlSubsetError)) throw error;
      skipped.push({ item: `mcp_servers.${entry.name}`, reason: `unsupported YAML (${error.message}); server skipped` });
    }
  }
  return { servers, present: true };
}

function mapModel(lines: ReturnType<typeof toYamlLines>, skipped: SkippedField[]): { model: ModelConfig | null; present: boolean } {
  const section = readSection(lines, "model");
  if (section.kind === "absent") return { model: null, present: false };
  if (section.kind === "inline") {
    skipped.push({ item: "model", reason: "bare model name has no provider; set provider and model with `vanta setup`" });
    return { model: null, present: true };
  }
  const parsed = parseYamlBlock(section.lines);
  if (!isMap(parsed)) return { model: null, present: true };
  for (const key of Object.keys(parsed).filter((k) => !["default", "model", "provider"].includes(k))) {
    skipped.push({ item: `model.${key}`, reason: key === "api_key" ? "credentials are never copied" : "no Vanta setting is changed from this field" });
  }
  const name = [parsed.default, parsed.model].find((v) => typeof v === "string" && v);
  const provider = typeof parsed.provider === "string" ? parsed.provider.toLowerCase() : "";
  const mapped = PROVIDER_MAP[provider];
  if (typeof name !== "string") return { model: null, present: true };
  if (!mapped) {
    skipped.push({ item: "model.default", reason: `provider "${provider || "(none)"}" has no safe Vanta equivalent, so "${name}" is not set; use \`vanta setup\`` });
    return { model: null, present: true };
  }
  return { model: { provider: mapped, model: name }, present: true };
}

function guarded<T>(item: string, skipped: SkippedField[], fallback: T, run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (!(error instanceof YamlSubsetError)) throw error;
    skipped.push({ item, reason: `unsupported YAML (${error.message}); nothing imported from it` });
    return fallback;
  }
}

/** Read the sections of a Hermes config.yaml that Vanta can use. Never throws on unsupported YAML. */
export function importHermesYaml(text: string): HermesYamlImport {
  const skipped: SkippedField[] = [];
  const lines = toYamlLines(text);
  const mcp = guarded("mcp_servers", skipped, { servers: {}, present: true }, () => mapMcp(lines, skipped));
  const model = guarded("model", skipped, { model: null, present: true }, () => mapModel(lines, skipped));
  return { mcp: mcp.servers, model: model.model, skipped, sections: { mcp: mcp.present, model: model.present } };
}
