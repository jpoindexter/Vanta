import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { z } from "zod";
import type { Tool } from "./types.js";
import { resolveInScope } from "../scope.js";
import { expandHome, resolveReadableZones, isInZone } from "./writable-zones.js";
import { resolveVisionProvider } from "../routing/vision.js";

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
      "Send a local image to a vision model and return a text description. Reads inside the " +
      "project freely; outside it, the image must be in a readable zone (the project's parent " +
      "dir plus ~/Desktop and ~/Downloads by default). Use an absolute or ~-prefixed path for " +
      "files outside the repo (e.g. a screenshot on ~/Desktop).",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path relative to the project root, or an absolute / ~-prefixed path inside a readable zone",
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
    const { prompt } = parsed.data;
    // Expand ~ BEFORE the scope check — otherwise "~/Desktop/x.png" resolves to a
    // bogus "<root>/~/Desktop/x.png" that passes the in-scope test then ENOENTs.
    const path = expandHome(parsed.data.path);

    const { ok, path: abs } = resolveInScope(path, ctx.root);
    // Outside the project root: permitted only inside a configured readable zone
    // (so a screenshot on ~/Desktop works, mirroring read_file).
    if (!ok && !isInZone(abs, resolveReadableZones(process.env, ctx.root))) {
      return {
        ok: false,
        output: `refused: ${path} is outside the project and not in a readable zone (set VANTA_READABLE_DIRS to allow more)`,
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
      // Route through the auxiliary vision model (VANTA_VISION_MODEL) when set, else
      // the active provider — so a text-only main model doesn't break sight.
      const provider = resolveVisionProvider(process.env);
      const result = await provider.complete(
        [{ role: "user", content: prompt ?? DEFAULT_PROMPT, images: [{ mime, dataBase64: buf.toString("base64") }] }],
        [],
      );
      return result.text?.trim()
        ? { ok: true, output: result.text.trim() }
        : { ok: false, output: "vision model returned no description — the model is not vision-capable. Set VANTA_VISION_MODEL (e.g. gpt-4o-mini) to delegate sight to a dedicated vision model." };
    } catch (err) {
      return {
        ok: false,
        output: `could not describe ${path}: ${(err as Error).message}`,
      };
    }
  },
};
