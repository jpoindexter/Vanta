import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { Tool } from "./types.js";

const run = promisify(execFile);
const Args = z.object({ command: z.string().min(1) });

// Belt-and-suspenders local block, in addition to the kernel safety gate.
const DESTRUCTIVE = /\brm\s+-rf?\b|\bsudo\b|\bchmod\s+777\b|\bmkfs\b|>\s*\/dev\/|:\(\)\s*\{/;

const MAX_OUTPUT = 1024 * 1024;
const TIMEOUT_MS = 30_000;

export const shellCmdTool: Tool = {
  schema: {
    name: "shell_cmd",
    description:
      "Run a shell command inside the project scope. Returns combined stdout/stderr. Destructive commands are blocked.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to run" },
      },
      required: ["command"],
    },
  },
  describeForSafety: (a) => `run shell command: ${String(a.command ?? "")}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'shell_cmd needs a "command" string' };
    }
    const { command } = parsed.data;
    if (DESTRUCTIVE.test(command)) {
      return {
        ok: false,
        output: "refused: command matches a destructive pattern",
      };
    }
    try {
      const { stdout, stderr } = await run("sh", ["-c", command], {
        cwd: ctx.root,
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT,
      });
      const out = [stdout, stderr].filter(Boolean).join("\n").trim();
      return { ok: true, output: out || "(command produced no output)" };
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message: string };
      const out = [e.stdout, e.stderr].filter(Boolean).join("\n").trim();
      return { ok: false, output: out || e.message };
    }
  },
};
