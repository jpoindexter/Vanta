import { z } from "zod";
import type { Tool } from "./types.js";
import { formatMarketing, readMarketing } from "../marketing/connectors.js";

const Args = z.object({
  provider: z.enum(["amplitude", "customerio"]),
  fixture: z.string().optional(),
});

export const marketingReadTool: Tool = {
  schema: {
    name: "marketing_read",
    description: "Read marketing/analytics records from Amplitude events or Customer.io campaigns. Uses env credentials for live reads or a fixture path for review/test runs.",
    parameters: {
      type: "object",
      properties: {
        provider: { type: "string", enum: ["amplitude", "customerio"] },
        fixture: { type: "string", description: "Optional local JSON fixture path instead of a live API read." },
      },
      required: ["provider"],
    },
  },
  describeForSafety: (a) => `read marketing connector ${String(a.provider ?? "")}`,
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "marketing_read needs provider: amplitude|customerio" };
    try {
      return { ok: true, output: formatMarketing(await readMarketing(parsed.data)) };
    } catch (err) {
      return { ok: false, output: err instanceof Error ? err.message : String(err) };
    }
  },
};
