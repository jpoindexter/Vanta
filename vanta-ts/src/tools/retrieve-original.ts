import { join } from "node:path";
import { z } from "zod";
import type { Tool } from "./types.js";
import { retrieveOriginal } from "../compress/store.js";

// CCR retrieval: the reverse of native compression. When a tool output was
// compressed before entering history, the agent gets an `original_id`. This tool
// reads the full, uncompressed original back from `.vanta/ccr/`. Pure read of a
// local file the agent itself produced — kernel-Allow (no path, no command).

const ArgsSchema = z.object({
  original_id: z.string().min(1).describe("The original_id from a [vanta compressed …] footer."),
});

export const retrieveOriginalTool: Tool = {
  schema: {
    name: "retrieve_original",
    description:
      "Expand a compressed tool output back to its full original. Pass the " +
      "original_id shown in a [vanta compressed …] footer to read the complete content.",
    parameters: {
      type: "object",
      properties: {
        original_id: {
          type: "string",
          description: "The original_id from a [vanta compressed …] footer.",
        },
      },
      required: ["original_id"],
    },
  },
  describeForSafety: () => "retrieve a locally-cached original tool output (CCR)",
  execute: async (args, ctx) => {
    const parsed = ArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, output: `invalid args: ${parsed.error.issues[0]?.message ?? "bad input"}` };
    }
    const original = await retrieveOriginal(join(ctx.root, ".vanta"), parsed.data.original_id);
    if (original === null) {
      return { ok: false, output: `no cached original for id "${parsed.data.original_id}"` };
    }
    return { ok: true, output: original };
  },
};
