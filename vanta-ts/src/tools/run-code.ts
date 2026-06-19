import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { isSandboxError } from "../sandbox/run.js";
import { wrapExec } from "../exec/backend.js";

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
  root: string,
): Promise<ToolResult> {
  // Execution backend: docker (VANTA_EXEC_BACKEND=docker) → container; else OS
  // sandbox (VANTA_SANDBOX=1) → wrapped; else base unchanged.
  const sb = await wrapExec({ env: process.env, root, baseCmd: cmd[0], baseArgs: cmd[1] });
  if (isSandboxError(sb)) return { ok: false, output: sb.error };
  try {
    const { stdout, stderr } = await run(sb.cmd, sb.args, {
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
  } finally {
    await sb.cleanup?.();
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
        const compiled = await runStep(runner.compile, dir, language, ctx.root);
        if (!compiled.ok) {
          return compiled;
        }
      }
      return await runStep(runner.exec, dir, language, ctx.root);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
};
