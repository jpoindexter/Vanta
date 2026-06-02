import { z } from "zod";
import type { Tool } from "./types.js";

// Speech-to-text / audio understanding: transcribe an audio file with whisper
// (pip install openai-whisper). Clear error if whisper isn't on PATH.

const Args = z.object({ path: z.string().min(1), model: z.string().optional() });

export const transcribeTool: Tool = {
  schema: {
    name: "transcribe",
    description: "Transcribe an audio file to text (speech-to-text via whisper). Args: path, model (default base).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to an audio file (mp3/wav/m4a/…)" },
        model: { type: "string", description: "whisper model size (tiny|base|small|medium); default base" },
      },
      required: ["path"],
    },
  },
  describeForSafety: (a) => `transcribe audio ${String(a.path ?? "")}`,
  async execute(raw) {
    const p = Args.safeParse(raw);
    if (!p.success) return { ok: false, output: 'transcribe needs a "path" string' };
    try {
      const { tmpdir, homedir } = await import("node:os");
      const { join } = await import("node:path");
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const { mkdtemp, readdir, readFile, rm } = await import("node:fs/promises");

      const abs = p.data.path.startsWith("~") ? join(homedir(), p.data.path.slice(1)) : p.data.path;
      const dir = await mkdtemp(join(tmpdir(), "argo-stt-"));
      try {
        await promisify(execFile)("whisper", [abs, "--output_format", "txt", "--output_dir", dir, "--model", p.data.model ?? "base", "--fp16", "False"]);
        const txt = (await readdir(dir)).find((f) => f.endsWith(".txt"));
        if (!txt) return { ok: false, output: "transcription produced no text" };
        return { ok: true, output: (await readFile(join(dir, txt), "utf8")).trim() || "(empty transcription)" };
      } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    } catch (err) {
      const msg = (err as Error).message;
      return { ok: false, output: /ENOENT|whisper/i.test(msg) ? "transcribe needs whisper (pip install openai-whisper)" : `transcribe failed: ${msg}` };
    }
  },
};
