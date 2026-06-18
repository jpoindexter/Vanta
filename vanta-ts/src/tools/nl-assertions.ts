import { z } from "zod";
import type { Tool } from "./types.js";
import { resolveProvider } from "../providers/index.js";
import {
  formatAssertionReport,
  judgePlainAssertions,
} from "../verify/nl-assertions.js";

const Args = z.object({
  input: z.string().min(1),
  output: z.string().min(1),
  assertions: z.array(z.string().min(1)).min(1).max(20),
  context: z.string().optional(),
});

function judgeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (!env.VANTA_ASSERTION_PROVIDER && !env.VANTA_ASSERTION_MODEL) return env;
  return {
    ...env,
    VANTA_PROVIDER: env.VANTA_ASSERTION_PROVIDER ?? env.VANTA_PROVIDER,
    VANTA_MODEL: env.VANTA_ASSERTION_MODEL ?? env.VANTA_MODEL,
  };
}

export const nlAssertionsTool: Tool = {
  schema: {
    name: "nl_assertions",
    description:
      "Run plain-English assertions as an independent LLM judge against a captured input/output pair. " +
      "Use this for self-harness checks like 'the response must not reveal secrets' or 'the answer must cite the failing command'.",
    parameters: {
      type: "object",
      properties: {
        input: { type: "string", description: "Captured user/task input being judged" },
        output: { type: "string", description: "Captured agent/system output being judged" },
        assertions: {
          type: "array",
          items: { type: "string" },
          description: "Plain-English pass/fail assertions to judge",
        },
        context: { type: "string", description: "Optional extra context for the judge" },
      },
      required: ["input", "output", "assertions"],
    },
  },
  describeForSafety: () => "run plain-English assertion judge",
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: "nl_assertions needs input, output, and 1-20 assertions" };
    }
    try {
      const provider = resolveProvider(judgeEnv(process.env));
      const report = await judgePlainAssertions(parsed.data, provider);
      return { ok: report.pass, output: formatAssertionReport(report) };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { ok: false, output: `assertion judge unavailable: ${detail}` };
    }
  },
};
