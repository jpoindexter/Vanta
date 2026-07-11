import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { estimateCostUsd } from "../pricing.js";
import type { LLMProvider } from "../providers/interface.js";

const BaseRequestSchema = z.object({
  purpose: z.string().min(3).max(160), prompt: z.string().min(1).max(100_000),
  budgetUsd: z.number().positive().max(10), timeoutMs: z.number().int().min(100).max(120_000),
  maxTokens: z.number().int().min(1).max(16_384),
}).strict();

const JsonSchema = z.object({
  type: z.enum(["object", "array", "string", "number", "boolean"]),
  required: z.array(z.string()).optional(), properties: z.record(z.unknown()).optional(), items: z.unknown().optional(),
}).passthrough();

const StructuredRequestSchema = BaseRequestSchema.extend({ schema: JsonSchema }).strict();
export type PluginLlmRequest = z.infer<typeof BaseRequestSchema>;
export type PluginStructuredRequest = z.infer<typeof StructuredRequestSchema>;
export type PluginLlmResult = { text: string; model: string; inputTokens: number; outputTokens: number; costUsd: number | null };

export type PluginLlmLane = {
  complete: (request: PluginLlmRequest) => Promise<PluginLlmResult>;
  completeStructured: (request: PluginStructuredRequest) => Promise<unknown>;
};

export function createPluginLlmLane(opts: {
  plugin: string; dataDir: string; provider: (purpose: string) => LLMProvider; hostBudgetUsd: number; now?: () => Date;
}): PluginLlmLane {
  const complete = async (input: PluginLlmRequest): Promise<PluginLlmResult> => {
    const request = BaseRequestSchema.parse(input);
    assertBudget(request, opts.hostBudgetUsd);
    const provider = opts.provider(request.purpose), controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const result = await provider.complete([{ role: "user", content: request.prompt }], [], { maxTokens: request.maxTokens, signal: controller.signal });
      const usage = result.usage ?? { inputTokens: Math.ceil(request.prompt.length / 4), outputTokens: Math.ceil(result.text.length / 4) };
      const costUsd = estimateCostUsd(provider.modelId(), usage.inputTokens, usage.outputTokens);
      if (costUsd !== null && costUsd > request.budgetUsd) throw new Error(`plugin LLM call exceeded request budget: $${costUsd.toFixed(4)}`);
      await appendAudit(opts, { request, model: provider.modelId(), usage, costUsd, outcome: "passed" });
      return { text: result.text, model: provider.modelId(), ...usage, costUsd };
    } catch (error) {
      await appendAudit(opts, { request, model: provider.modelId(), costUsd: null, outcome: "failed" });
      throw error;
    } finally { clearTimeout(timer); }
  };
  return {
    complete,
    async completeStructured(input) {
      const request = StructuredRequestSchema.parse(input);
      const result = await complete({
        purpose: request.purpose, budgetUsd: request.budgetUsd, timeoutMs: request.timeoutMs, maxTokens: request.maxTokens,
        prompt: `${request.prompt}\n\nReturn only JSON matching this schema:\n${JSON.stringify(request.schema)}`,
      });
      const value = JSON.parse(result.text) as unknown;
      if (!matchesSchema(value, request.schema)) throw new Error("plugin LLM structured output failed schema validation");
      return value;
    },
  };
}

function assertBudget(request: PluginLlmRequest, hostCap: number): void {
  if (request.budgetUsd > hostCap) throw new Error(`plugin LLM request exceeds host cap $${hostCap.toFixed(4)}`);
  const worstCaseTokens = Math.floor((request.budgetUsd * 1_000_000) / 75);
  if (request.maxTokens > worstCaseTokens) throw new Error(`maxTokens exceeds conservative request budget (${worstCaseTokens})`);
}

function matchesSchema(value: unknown, schema: z.infer<typeof JsonSchema>): boolean {
  const primitive = primitiveMatches(value, schema.type);
  if (primitive !== null) return primitive;
  if (schema.type === "array") return Array.isArray(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (!(schema.required ?? []).every((key) => key in record)) return false;
  return Object.entries(schema.properties ?? {}).every(([key, child]) => !(key in record) || !JsonSchema.safeParse(child).success || matchesSchema(record[key], JsonSchema.parse(child)));
}

function primitiveMatches(value: unknown, type: string): boolean | null {
  if (type === "string" || type === "number" || type === "boolean") return typeof value === type;
  return null;
}

type AuditInput = { request: PluginLlmRequest; model: string; usage?: { inputTokens: number; outputTokens: number }; costUsd: number | null; outcome: "passed" | "failed" };

async function appendAudit(opts: { plugin: string; dataDir: string; now?: () => Date }, input: AuditInput): Promise<void> {
  await mkdir(opts.dataDir, { recursive: true });
  const request = input.request;
  const event = { plugin: opts.plugin, purpose: request.purpose, model: input.model, budgetUsd: request.budgetUsd, timeoutMs: request.timeoutMs, maxTokens: request.maxTokens, usage: input.usage, costUsd: input.costUsd, outcome: input.outcome, at: (opts.now?.() ?? new Date()).toISOString() };
  await appendFile(join(opts.dataDir, "plugin-llm-audit.jsonl"), `${JSON.stringify(event)}\n`, "utf8");
}
