// MEM-TOOL-OUTPUT-DELIVERY — how a large tool result is DELIVERED shifts end-to-end
// accuracy as much as swapping retrievers (agent-harness paper). Inline wins broadly;
// file-based (programmatic) delivery only pays off when the backbone reliably closes
// the read→integrate→retry loop — WEAK backbones regress with it. So the policy:
// inline is the default; oversized output offloads to a grep-able file ONLY for a
// strong backbone; a weak backbone gets a larger inline-truncated window instead,
// never a file-only pointer it won't follow. Pure + size-and-backbone keyed.

export type Backbone = "strong" | "weak";
export type DeliveryMode = "inline" | "file";

// Small / distilled models that don't reliably follow a retrieval pointer.
const WEAK_PATTERNS: RegExp[] = [
  /\bmini\b/i, /haiku/i, /flash-?lite/i, /\bnano\b/i, /gemma/i, /\bphi-?\d/i,
  /mistral-7b/i, /:(?:0\.\d|[1-9]|1[0-4])b\b/i, /\b[1-9]b\b/i, /\b1[0-4]b\b/i,
];
// Frontier / large models that handle file-based delivery well.
const STRONG_PATTERNS: RegExp[] = [
  /gpt-[45]/i, /\bo[1-4]\b/i, /opus/i, /sonnet/i, /claude-3\.[57]/i,
  /gemini-(?:1\.5|2|2\.5).*pro/i, /deepseek/i, /:(?:3[0-9]|[4-9]\d|\d{3})b\b/i,
];

/** Classify a model id as a strong or weak backbone. Weak is checked FIRST so a
 * distilled variant of a strong family (gpt-4o-mini, o3-mini, *-haiku) is correctly
 * weak. Unknown → strong (preserves the existing offload-on-size behavior; only
 * clearly-small models are gated). Pure. */
export function classifyBackbone(modelId: string): Backbone {
  if (WEAK_PATTERNS.some((re) => re.test(modelId))) return "weak";
  if (STRONG_PATTERNS.some((re) => re.test(modelId))) return "strong";
  return "strong";
}

/** Resolve the backbone from an explicit model id, else VANTA_MODEL. Pure. */
export function resolveBackbone(env: NodeJS.ProcessEnv, modelId?: string): Backbone {
  return classifyBackbone(modelId ?? env.VANTA_MODEL ?? "");
}

/** VANTA_FILE_DELIVERY = off forces inline everywhere; on forces file for any backbone. */
function deliveryOverride(env: NodeJS.ProcessEnv): DeliveryMode | null {
  const v = (env.VANTA_FILE_DELIVERY ?? "").trim().toLowerCase();
  if (v === "off" || v === "0" || v === "false") return "inline";
  if (v === "on" || v === "1" || v === "true") return "file";
  return null;
}

/** Inline window for a weak backbone's truncated (self-contained) delivery. */
export const WEAK_INLINE_CHARS = 8_000;
/** Inline preview kept above a strong backbone's file pointer. */
export const FILE_PREVIEW_CHARS = 2_000;

/** Decide how an oversized result is delivered. Pure. */
export function resolveDelivery(env: NodeJS.ProcessEnv, modelId?: string): {
  mode: DeliveryMode;
  inlineChars: number;
} {
  const forced = deliveryOverride(env);
  const mode = forced ?? (resolveBackbone(env, modelId) === "strong" ? "file" : "inline");
  return { mode, inlineChars: mode === "file" ? FILE_PREVIEW_CHARS : WEAK_INLINE_CHARS };
}
