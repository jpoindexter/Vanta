import { z } from "zod";
import type { Tool } from "./types.js";

const Args = z.object({
  seconds: z.number().min(0).max(3600).default(1),
});

export const sleepTool: Tool = {
  schema: {
    name: "sleep",
    description:
      "Pause execution for a given number of seconds. Useful for polling loops, " +
      "waiting for async side-effects to complete, or rate-limit backoff.",
    parameters: {
      type: "object",
      required: [],
      properties: {
        seconds: {
          type: "number",
          description: "Number of seconds to sleep (0–3600). Default: 1.",
        },
      },
    },
  },
  describeForSafety: () => "pause execution",
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: `Invalid args: ${parsed.error.message}` };
    }
    const { seconds } = parsed.data;

    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    return { ok: true, output: `Slept for ${seconds}s.` };
  },
};
