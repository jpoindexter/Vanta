import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { z } from "zod";
import type { Tool } from "./types.js";
import { resolveInScope } from "../scope.js";
import { resolveProvider } from "../providers/index.js";

const Args = z.object({
  path: z.string().min(1),
  prompt: z.string().optional(),
});

const DEFAULT_PROMPT = "Describe this image.";

// Vision models accept these raster formats as data URLs; reject anything else
// before spending an API call on it.
const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/**
 * Map a file extension to a supported image MIME type, or null if unsupported.
 * Pure so it can be unit-tested without touching the filesystem or network.
 */
export function mimeForImage(path: string): string | null {
  return MIME_BY_EXT[extname(path).toLowerCase()] ?? null;
}

export const describeImageTool: Tool = {
  schema: {
    name: "describe_image",
    description:
      "Send a local image (inside the project scope) to a vision model and return a text description.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to an image file, relative to the project root",
        },
        prompt: {
          type: "string",
          description: "What to look for (defaults to a general description)",
        },
      },
      required: ["path"],
    },
  },
  describeForSafety: (a) => `analyze image ${String(a.path ?? "")}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'describe_image needs a "path" string' };
    }
    const { path, prompt } = parsed.data;

    const { ok, path: abs } = resolveInScope(path, ctx.root);
    if (!ok) {
      return {
        ok: false,
        output: `refused: path is outside project scope: ${path}`,
      };
    }

    const mime = mimeForImage(abs);
    if (!mime) {
      return {
        ok: false,
        output: `unsupported image type for ${path}; expected png/jpg/jpeg/webp/gif`,
      };
    }

    try {
      const buf = await readFile(abs);
      // Use the ACTIVE provider's vision (Gemini/Codex/OpenAI/Anthropic) via the
      // multimodal message pipeline — no hardcoded OpenAI key.
      const provider = resolveProvider(process.env);
      const result = await provider.complete(
        [{ role: "user", content: prompt ?? DEFAULT_PROMPT, images: [{ mime, dataBase64: buf.toString("base64") }] }],
        [],
      );
      return result.text?.trim()
        ? { ok: true, output: result.text.trim() }
        : { ok: false, output: "vision model returned no description (is the active model vision-capable?)" };
    } catch (err) {
      return {
        ok: false,
        output: `could not describe ${path}: ${(err as Error).message}`,
      };
    }
  },
};
