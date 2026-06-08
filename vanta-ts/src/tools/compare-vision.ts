import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { z } from "zod";
import type { Tool } from "./types.js";
import type { LLMProvider } from "../providers/interface.js";
import { resolveInScope } from "../scope.js";
import { resolveVisionProvider } from "../routing/vision.js";
import { mimeForImage } from "./describe-image.js";
import { readRegion } from "../brain/store.js";

const Args = z.object({
  images: z.array(z.string().min(1)).min(1).max(4),
  focus: z.string().optional(),
});

export type CompareVisionInput = {
  provider: LLMProvider;
  images: Array<{ label: string; mime: string; dataBase64: string }>;
  focus?: string;
  prefs: string;
};

/**
 * Pure orchestration core — injectable for testing.
 * Describes each image individually then synthesizes a ranked critique.
 */
export async function compareVision(input: CompareVisionInput): Promise<string> {
  const { provider, images, focus, prefs } = input;
  const focusNote = focus ? ` Focus specifically on: ${focus}.` : "";

  // Phase 1: describe each image
  const descriptions: string[] = [];
  for (const img of images) {
    const prompt =
      `Describe this image clearly and analytically.${focusNote} ` +
      `Note layout, visual weight, hierarchy, style, and any notable design choices.`;
    const result = await provider.complete(
      [{ role: "user", content: prompt, images: [{ mime: img.mime, dataBase64: img.dataBase64 }] }],
      [],
    );
    descriptions.push(result.text?.trim() || "(no description)");
  }

  // Phase 2: synthesize — ranked recommendation + per-image critique
  const descBlock = images
    .map((img, i) => `## Image ${i + 1}: ${img.label}\n${descriptions[i]}`)
    .join("\n\n");
  const prefsBlock = prefs
    ? `\n\n## Known brand preferences\n${prefs}`
    : "";
  const synthesisPrompt =
    `You have described ${images.length} image(s) for visual comparison.${prefsBlock}\n\n` +
    `${descBlock}\n\n` +
    `Now produce a grounded visual critique with these sections:\n` +
    `1. **Ranked recommendation** — which image fits best and why (one paragraph)\n` +
    `2. **Per-image critique** — 1–2 sentences per image (reference each by its label)\n` +
    `3. **Direction note** — what the winning image does right that the others don't\n` +
    (focus ? `\nKeep every section grounded in the focus dimension: ${focus}.\n` : "");

  const synth = await provider.complete(
    [{ role: "user", content: synthesisPrompt }],
    [],
  );
  return synth.text?.trim() || "(no synthesis produced)";
}

async function loadPrefs(env: NodeJS.ProcessEnv): Promise<string> {
  const parts: string[] = [];
  const reflections = await readRegion("reflections", env);
  if (reflections) parts.push(reflections.trim());
  const userModel = await readRegion("user_model", env);
  if (userModel) parts.push(userModel.trim());
  return parts.join("\n\n");
}

export const compareVisionTool: Tool = {
  schema: {
    name: "compare_vision",
    description:
      "Compare 1–4 images and produce a grounded visual critique referencing known brand preferences. " +
      "Returns a ranked recommendation, per-image critique, and a direction note.",
    parameters: {
      type: "object",
      properties: {
        images: {
          type: "array",
          items: { type: "string" },
          description: "Paths to image files (absolute or relative to project root). 1–4 images.",
        },
        focus: {
          type: "string",
          description:
            "Optional evaluation dimension, e.g. 'layout hierarchy', 'brand fit', 'visual weight'.",
        },
      },
      required: ["images"],
    },
  },
  describeForSafety: () => "analyze and compare images",
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        output: 'compare_vision needs "images" (array of 1–4 path strings)',
      };
    }
    const { images: paths, focus } = parsed.data;

    // Resolve + validate each path
    const resolved: Array<{ label: string; mime: string; dataBase64: string }> = [];
    for (const p of paths) {
      const { ok, path: abs } = resolveInScope(p, ctx.root);
      if (!ok) {
        return {
          ok: false,
          output: `refused: path is outside project scope: ${p}`,
        };
      }
      const mime = mimeForImage(abs);
      if (!mime) {
        return {
          ok: false,
          output: `unsupported image type for ${p}; expected png/jpg/jpeg/webp/gif`,
        };
      }
      try {
        const buf = await readFile(abs);
        resolved.push({ label: basename(abs), mime, dataBase64: buf.toString("base64") });
      } catch (err) {
        return {
          ok: false,
          output: `could not read ${p}: ${(err as Error).message}`,
        };
      }
    }

    try {
      const provider = resolveVisionProvider(process.env);
      const prefs = await loadPrefs(process.env);
      const output = await compareVision({ provider, images: resolved, focus, prefs });
      return { ok: true, output };
    } catch (err) {
      return {
        ok: false,
        output: `compare_vision failed: ${(err as Error).message}`,
      };
    }
  },
};
