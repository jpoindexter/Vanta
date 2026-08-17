import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { Tool } from "./types.js";

const Args = z.object({
  action: z.enum(["doctor", "install_plan", "integration", "benchmark"]),
  topk: z.number().min(0.1).max(1).optional(),
  causal: z.boolean().optional(),
  batch: z.number().int().min(1).max(8).optional(),
  heads: z.number().int().min(1).max(64).optional(),
  sequence_length: z.number().int().min(128).max(32_768).optional(),
  head_dim: z.union([z.literal(64), z.literal(128)]).optional(),
  warmup: z.number().int().min(1).max(20).optional(),
  iterations: z.number().int().min(1).max(100).optional(),
});

type SpargeArgs = z.infer<typeof Args>;

export function buildSpargeArgs(input: SpargeArgs): string[] {
  if (input.action === "doctor") return ["doctor", "--json"];
  if (input.action === "install_plan") return ["install-plan"];
  if (input.action === "integration") {
    const args = ["integration", "--topk", String(input.topk ?? 0.5)];
    if (input.causal) args.push("--causal");
    return args;
  }
  const args = [
    "benchmark",
    "--batch", String(input.batch ?? 1),
    "--heads", String(input.heads ?? 8),
    "--sequence-length", String(input.sequence_length ?? 4096),
    "--head-dim", String(input.head_dim ?? 128),
    "--topk", String(input.topk ?? 0.5),
    "--warmup", String(input.warmup ?? 5),
    "--iterations", String(input.iterations ?? 20),
    "--json",
  ];
  if (input.causal) args.push("--causal");
  return args;
}

export const spargeAttentionTool: Tool = {
  schema: {
    name: "sparge_attention",
    description:
      "Diagnose, plan, integrate, or benchmark the globally installed SpargeAttention kit for compatible local PyTorch/CUDA inference. " +
      "The tool cannot accelerate hosted OpenAI, Claude, Gemini, or other remote APIs. " +
      "doctor and install_plan are read-only; integration returns a snippet without editing files; benchmark is hard-bounded local GPU compute.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["doctor", "install_plan", "integration", "benchmark"],
          description: "Operation to perform",
        },
        topk: { type: "number", minimum: 0.1, maximum: 1, description: "Sparse block retention ratio (default 0.5)" },
        causal: { type: "boolean", description: "Use causal attention" },
        batch: { type: "integer", minimum: 1, maximum: 8 },
        heads: { type: "integer", minimum: 1, maximum: 64 },
        sequence_length: { type: "integer", minimum: 128, maximum: 32_768 },
        head_dim: { type: "integer", enum: [64, 128] },
        warmup: { type: "integer", minimum: 1, maximum: 20 },
        iterations: { type: "integer", minimum: 1, maximum: 100 },
      },
      required: ["action"],
    },
  },
  describeForSafety: (raw) =>
    `read-only SpargeAttention ${String(raw.action ?? "doctor")} operation`,
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        output: `sparge_attention invalid arguments: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
      };
    }
    if (
      parsed.data.action === "benchmark" &&
      parsed.data.sequence_length !== undefined &&
      parsed.data.sequence_length % 128 !== 0
    ) {
      return { ok: false, output: "sparge_attention: sequence_length must be divisible by 128" };
    }
    const command = process.env.SPARGE_ATTN_BIN ?? "sparge-attn";
    const timeout = parsed.data.action === "benchmark" ? 125_000 : 20_000;
    try {
      const { stdout, stderr } = await promisify(execFile)(
        command,
        buildSpargeArgs(parsed.data),
        { timeout, maxBuffer: 1_000_000, windowsHide: true },
      );
      const output = stdout.trim() || stderr.trim();
      return { ok: true, output: output || "(no output)" };
    } catch (error) {
      const failure = error as Error & { stderr?: string; stdout?: string; code?: string | number };
      if (failure.code === "ENOENT") {
        return {
          ok: false,
          output: "sparge_attention is not installed. Install the global sparge-attention-kit or set SPARGE_ATTN_BIN.",
        };
      }
      const detail = failure.stderr?.trim() || failure.stdout?.trim() || failure.message;
      return { ok: false, output: `sparge_attention failed: ${detail}` };
    }
  },
};
