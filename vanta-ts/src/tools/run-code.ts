import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";

const run = promisify(execFile);

const Args = z.object({
  language: z.enum(["python", "node", "rust"]),
  code: z.string().min(1),
});

type Language = z.infer<typeof Args>["language"];

const TIMEOUT_MS = 30_000;
const MAX_OUTPUT = 1024 * 1024;

/** Per-language source filename plus the commands to compile (optional) then run. */
const RUNNERS: Record<
  Language,
  { file: string; compile?: [string, string[]]; exec: [string, string[]] }
> = {
  python: { file: "main.py", exec: ["python3", ["main.py"]] },
  node: { file: "main.mjs", exec: ["node", ["main.mjs"]] },
  rust: {
    file: "main.rs",
    compile: ["rustc", ["main.rs", "-o", "main"]],
    exec: ["./main", []],
  },
};

function combine(stdout?: string, stderr?: string): string {
  return [stdout, stderr].filter(Boolean).join("\n").trim();
}

async function runStep(
  cmd: [string, string[]],
  cwd: string,
  language: Language,
): Promise<ToolResult> {
  try {
    const { stdout, stderr } = await run(cmd[0], cmd[1], {
      cwd,
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT,
    });
    return { ok: true, output: combine(stdout, stderr) };
  } catch (err) {
    const e = err as {
      stdout?: string;
      stderr?: string;
      message: string;
      code?: string;
      killed?: boolean;
    };
    // A missing toolchain surfaces as ENOENT on the spawned binary.
    if (e.code === "ENOENT") {
      return { ok: false, output: `${language} not installed` };
    }
    const captured = combine(e.stdout, e.stderr);
    const detail = e.killed ? `timed out after ${TIMEOUT_MS}ms` : e.message;
    return { ok: false, output: captured || detail };
  }
}

export const runCodeTool: Tool = {
  schema: {
    name: "run_code",
    description:
      "Run a code snippet (python, node, or rust) in an isolated temp dir with a 30s timeout. Returns combined stdout/stderr. Requires approval.",
    parameters: {
      type: "object",
      properties: {
        language: {
          type: "string",
          enum: ["python", "node", "rust"],
          description: "The language to run the snippet in",
        },
        code: { type: "string", description: "The source code to execute" },
      },
      required: ["language", "code"],
    },
  },
  describeForSafety: (a) => `run ${String(a.language ?? "")} code`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        output:
          'run_code needs a "language" of python|node|rust and a non-empty "code" string',
      };
    }
    const { language, code } = parsed.data;

    const approved = await ctx.requestApproval(
      `run ${language} code`,
      "executes arbitrary code",
    );
    if (!approved) {
      return { ok: false, output: "denied" };
    }

    const runner = RUNNERS[language];
    const dir = await mkdtemp(join(tmpdir(), "vanta-run-code-"));
    try {
      await writeFile(join(dir, runner.file), code, "utf8");
      if (runner.compile) {
        const compiled = await runStep(runner.compile, dir, language);
        if (!compiled.ok) {
          return compiled;
        }
      }
      return await runStep(runner.exec, dir, language);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
};
