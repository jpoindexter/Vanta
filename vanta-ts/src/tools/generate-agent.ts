import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { resolveProvider } from "../providers/index.js";
import {
  buildGeneratePrompt,
  parseAgentDefinition,
  agentFileContent,
  agentFilePath,
} from "../agentgen/generate.js";

const Args = z.object({
  description: z.string().min(1),
  repo_context: z.string().optional(),
});

/** Produce the raw model output for a generate prompt. Injected for tests. */
export type Generator = (prompt: string) => Promise<string>;

/** Filesystem seam — injected so tests never touch real files. */
export type AgentFs = {
  mkdir: (dir: string) => Promise<void>;
  writeFile: (path: string, content: string) => Promise<void>;
};

export type GenerateAgentDeps = {
  /** Defaults to a real-provider one-shot completion. */
  generate?: Generator;
  /** Defaults to node:fs/promises. */
  fs?: AgentFs;
  /** Override the agent file location (tests). Defaults to the Vanta home. */
  filePath?: (identifier: string) => string;
};

function defaultGenerator(prompt: string): Promise<string> {
  return resolveProvider(process.env)
    .complete([{ role: "user", content: prompt }], [], { temperature: 0, maxTokens: 2_000 })
    .then((r) => r.text);
}

const defaultFs: AgentFs = {
  mkdir: (dir) => mkdir(dir, { recursive: true }).then(() => undefined),
  writeFile: (path, content) => writeFile(path, content, "utf8"),
};

/**
 * Generate an agent definition from a description and write it to a file.
 * The generation step and filesystem are injected so the orchestration is
 * fully unit-testable with no LLM and no real files. Errors-as-values.
 */
export async function runGenerateAgent(
  args: { description: string; repoContext: string },
  deps: GenerateAgentDeps = {},
): Promise<ToolResult> {
  const generate = deps.generate ?? defaultGenerator;
  const fs = deps.fs ?? defaultFs;
  const resolvePath = deps.filePath ?? ((id) => agentFilePath(id));

  let modelOutput: string;
  try {
    modelOutput = await generate(buildGeneratePrompt(args.description, args.repoContext));
  } catch (err) {
    return { ok: false, output: `agent generation failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const parsed = parseAgentDefinition(modelOutput);
  if (!parsed.ok) return { ok: false, output: `could not parse generated agent: ${parsed.error}` };

  const path = resolvePath(parsed.def.identifier);
  try {
    await fs.mkdir(dirname(path));
    await fs.writeFile(path, agentFileContent(parsed.def));
  } catch (err) {
    return { ok: false, output: `could not write agent file: ${err instanceof Error ? err.message : String(err)}` };
  }
  return {
    ok: true,
    output: `Wrote agent "${parsed.def.identifier}" to ${path}\nwhen to use: ${parsed.def.whenToUse}`,
  };
}

export const generateAgentTool: Tool = {
  schema: {
    name: "generate_agent",
    description:
      "Generate a new agent definition (identifier + when-to-use + system prompt) from a plain-English " +
      "description, tailored using repository context, and write it to an agent file under the Vanta home. " +
      "Use this to create a reusable specialist agent the orchestrator can later delegate to.",
    parameters: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "Plain-English description of the agent to create (its purpose and behavior)",
        },
        repo_context: {
          type: "string",
          description: "Optional repository/stack context to tailor the agent (e.g. languages, conventions)",
        },
      },
      required: ["description"],
    },
  },
  // Writes a definition file under the Vanta home — surface the write op to the
  // kernel; the description itself is not safety-relevant and could false-trigger.
  describeForSafety: () => "write a generated agent definition file",
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: "generate_agent needs a description string" };
    }
    const approved = await ctx.requestApproval(
      "write a generated agent definition file",
      "Creates a new agent definition under the Vanta home",
      "generate_agent",
    );
    if (!approved) return { ok: false, output: "agent generation declined" };
    return runGenerateAgent(
      { description: parsed.data.description, repoContext: parsed.data.repo_context ?? "" },
    );
  },
};
