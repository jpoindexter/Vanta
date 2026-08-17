import { createHash } from "node:crypto";
import { z } from "zod";
import { resolveMsaClient, resolveMsaConfig, type MsaClient } from "../memory/msa-client.js";
import type { Tool, ToolResult } from "./types.js";

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const Args = z.object({
  action: z.enum(["status", "index", "query", "generate"]),
  document_id: z.string().min(1).max(512).optional(),
  content: z.string().min(1).optional(),
  metadata: z.record(z.union([z.string(), z.number().finite(), z.boolean(), z.null()])).optional(),
  namespace: z.string().min(1).max(256).optional(),
  query: z.string().min(1).max(65_536).optional(),
  top_k: z.number().int().min(1).max(50).optional(),
  max_output_tokens: z.number().int().min(1).max(16_384).optional(),
});
type MsaArgs = z.infer<typeof Args>;

function documentId(content: string, supplied?: string): string {
  return supplied ?? createHash("sha256").update(content).digest("hex").slice(0, 24);
}

export async function executeMsaMemory(
  raw: unknown,
  client: MsaClient,
): Promise<ToolResult> {
  const parsed = Args.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, output: "msa_memory needs action=status|index|query|generate" };
  }
  const args: MsaArgs = parsed.data;
  if (args.action === "status") {
    const result = await client.health();
    if (!result.ok) return { ok: false, output: `MSA status failed: ${result.error}` };
    return { ok: true, output: JSON.stringify(result.value, null, 2) };
  }
  if (args.action === "index") {
    if (!args.content) return { ok: false, output: "MSA index needs content" };
    if (Buffer.byteLength(args.content, "utf8") > MAX_DOCUMENT_BYTES) {
      return { ok: false, output: "MSA index content exceeds the 10 MB per-document limit" };
    }
    const result = await client.index({
      namespace: args.namespace,
      documents: [{
        id: documentId(args.content, args.document_id),
        text: args.content,
        metadata: args.metadata,
      }],
    });
    if (!result.ok) return { ok: false, output: `MSA index failed: ${result.error}` };
    return { ok: true, output: JSON.stringify(result.value, null, 2) };
  }
  if (!args.query) return { ok: false, output: `MSA ${args.action} needs query` };
  if (args.action === "query") {
    const result = await client.query({
      query: args.query,
      topK: args.top_k ?? 10,
      namespace: args.namespace,
    });
    if (!result.ok) return { ok: false, output: `MSA query failed: ${result.error}` };
    return { ok: true, output: JSON.stringify(result.value, null, 2) };
  }
  const result = await client.generate({
    query: args.query,
    topK: args.top_k ?? 10,
    namespace: args.namespace,
    maxOutputTokens: args.max_output_tokens,
  });
  if (!result.ok) return { ok: false, output: `MSA generate failed: ${result.error}` };
  return { ok: true, output: JSON.stringify(result.value, null, 2) };
}

export const msaMemoryTool: Tool = {
  schema: {
    name: "msa_memory",
    description:
      "Use the optional Memory Sparse Attention runtime. Check status, index one text document, " +
      "retrieve cited memory segments, or generate an answer over the indexed memory. Vanta stays " +
      "TypeScript/Rust; the model runtime is a separately configured NVIDIA service.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["status", "index", "query", "generate"] },
        document_id: { type: "string", description: "Stable id for indexed content; generated when omitted." },
        content: { type: "string", description: "Text to index (10 MB maximum)." },
        metadata: { type: "object", description: "Flat string/number/boolean/null metadata." },
        namespace: { type: "string", description: "Optional memory collection/namespace." },
        query: { type: "string", description: "Question or retrieval query." },
        top_k: { type: "number", description: "Selected memory segments, 1-50." },
        max_output_tokens: { type: "number", description: "Generation cap, 1-16384." },
      },
      required: ["action"],
    },
  },
  describeForSafety: (raw) => {
    const action = String(raw.action ?? "unknown");
    return action === "index"
      ? "send content to the configured MSA memory runtime for indexing"
      : `${action} the configured MSA memory runtime`;
  },
  async execute(raw) {
    const config = resolveMsaConfig(process.env);
    if (!config.ok) {
      return {
        ok: false,
        output: `${config.error}. Set VANTA_MEMORY=msa and VANTA_MSA_URL=https://<gpu-host>.`,
      };
    }
    return executeMsaMemory(raw, resolveMsaClient(process.env)!);
  },
};
