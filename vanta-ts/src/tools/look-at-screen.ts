import { z } from "zod";
import type { LLMProvider } from "../providers/interface.js";
import { resolveVisionProvider } from "../routing/vision.js";
import { captureLook, type LookCaptureResult } from "../vision/look-capture.js";
import type { Tool } from "./types.js";

const Args = z.object({ prompt: z.string().optional() });
const DEFAULT_PROMPT = "Describe what is currently on the screen, including any visible text and UI state.";

type LookToolDeps = {
  capture?: typeof captureLook;
  resolveProvider?: (env: NodeJS.ProcessEnv) => LLMProvider;
};

export function createLookAtScreenTool(deps: LookToolDeps = {}): Tool {
  return {
    schema: {
      name: "look_at_screen",
      description: "Capture the current macOS screen and describe it with Vanta's routed vision model.",
      parameters: { type: "object", properties: { prompt: { type: "string", description: "What to look for" } } },
    },
    describeForSafety: () => "capture and analyze the screen",
    async execute(raw, ctx) {
      const parsed = Args.safeParse(raw);
      const prompt = parsed.success ? parsed.data.prompt : undefined;
      let provider: LLMProvider;
      try { provider = (deps.resolveProvider ?? resolveVisionProvider)(process.env); }
      catch (error) { return { ok: false, output: `look_at_screen needs a model: ${(error as Error).message}` }; }
      const capture = await (deps.capture ?? captureLook)({ mode: "screen", scope: ctx.root });
      if (capture.status !== "captured") return captureError(capture);
      try {
        const result = await provider.complete([{ role: "user", content: prompt ?? DEFAULT_PROMPT, images: capture.images }], []);
        const text = result.text?.trim();
        if (!text) return { ok: false, output: "Vision model returned no description. Choose a vision-capable model." };
        const receipt = capture.images[0]?.capture;
        return { ok: true, output: `${text}${receipt ? `\n\nCapture receipt: ${receipt.source} · ${receipt.capturedAt} · ${receipt.mode} · scope ${receipt.scope}` : ""}` };
      } catch (error) {
        return { ok: false, output: `look_at_screen failed: ${(error as Error).message}` };
      }
    },
  };
}

export const lookAtScreenTool = createLookAtScreenTool();

function captureError(result: Exclude<LookCaptureResult, { status: "captured" }>): { ok: false; output: string } {
  if (result.status === "cancelled") return { ok: false, output: "Screen capture cancelled." };
  if (result.status === "denied" || result.status === "oversized") return { ok: false, output: result.recovery };
  return { ok: false, output: result.error };
}
