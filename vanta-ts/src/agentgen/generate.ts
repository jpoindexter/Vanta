import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";

/**
 * A generated agent definition: a kebab-case identifier, a one-line "when to
 * use" trigger, and the tailored system prompt. This is the validated shape the
 * model is asked to produce and the file is rendered from.
 */
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

const IDENTIFIER_RE = /^[a-z][a-z0-9-]*[a-z0-9]$/;

export const AgentDefinitionSchema = z.object({
  identifier: z
    .string()
    .min(2)
    .max(64)
    .regex(IDENTIFIER_RE, "identifier must be kebab-case (a-z, 0-9, hyphens)"),
  whenToUse: z.string().min(1).max(400),
  systemPrompt: z.string().min(1),
});

/** A parse/validate failure carried as a value, never thrown across the boundary. */
export type ParseError = { ok: false; error: string };
export type ParseOk = { ok: true; def: AgentDefinition };
export type ParseResult = ParseOk | ParseError;

const GENERATE_SYS = `You design agent definitions for a local trusted-operator agent.
Given a description of the desired agent and repository context, produce ONE agent definition.
Reply ONLY as minified JSON, no prose, no code fences:
{"identifier":"kebab-case-id","whenToUse":"one line describing when to invoke this agent","systemPrompt":"the full system prompt for the agent"}
Rules:
- identifier: lowercase kebab-case (a-z, 0-9, hyphens), 2-64 chars, starts with a letter.
- whenToUse: a single concise sentence the orchestrator matches against to decide when to delegate.
- systemPrompt: a complete, self-contained operating prompt tailored to the description.`;

/**
 * Build the prompt that asks a model to author an agent definition from the
 * user's description plus repository context. Pure — no provider, no IO.
 */
export function buildGeneratePrompt(description: string, repoContext: string): string {
  const ctx = repoContext.trim();
  return [
    GENERATE_SYS,
    "",
    `Description of the agent to create:\n${description.trim()}`,
    ctx ? `\nRepository context:\n${ctx}` : "",
  ]
    .filter((part) => part !== "")
    .join("\n");
}

/**
 * Parse a model's response into a validated AgentDefinition. Extracts the first
 * JSON object (tolerating stray prose) and zod-validates it. Errors-as-values.
 */
export function parseAgentDefinition(modelOutput: string): ParseResult {
  const match = modelOutput.match(/\{[\s\S]*\}/);
  if (!match) return { ok: false, error: "model output contained no JSON object" };
  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return { ok: false, error: "model output was not valid JSON" };
  }
  const parsed = AgentDefinitionSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    return { ok: false, error: `invalid agent definition: ${detail}` };
  }
  return { ok: true, def: parsed.data };
}

/**
 * Render the agent definition as the markdown file body: YAML frontmatter
 * (name + description) followed by the system prompt as the body. Mirrors the
 * skill-file convention so the same loaders/readers apply.
 */
export function agentFileContent(def: AgentDefinition): string {
  const front = ["---", `name: ${def.identifier}`, `description: ${escapeYaml(def.whenToUse)}`, "---", ""].join("\n");
  return `${front}\n${def.systemPrompt.trim()}\n`;
}

/** Quote a YAML scalar when it contains characters that would break a bare value. */
function escapeYaml(value: string): string {
  const oneLine = value.replace(/\s+/g, " ").trim();
  return /[:#"'\n]/.test(oneLine) ? JSON.stringify(oneLine) : oneLine;
}

/**
 * Resolve the on-disk path for an agent definition under the Vanta home's
 * `agents/` dir. The identifier is already kebab-case-validated by the schema,
 * so it cannot escape the dir.
 */
export function agentFilePath(identifier: string, home: string = resolveVantaHome()): string {
  return join(home, "agents", `${identifier}.md`);
}
