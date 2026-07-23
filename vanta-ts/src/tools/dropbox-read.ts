import { z } from "zod";
import { downloadDropbox, listDropbox, searchDropbox } from "../integrations/dropbox.js";
import { appendIntegrationReceipt } from "../integrations/receipts.js";
import type { Tool } from "./types.js";

const Args = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), path: z.string().max(2_000).default("") }),
  z.object({ action: z.literal("search"), query: z.string().min(1).max(500), path: z.string().max(2_000).default("") }),
  z.object({ action: z.literal("read"), path: z.string().min(1).max(2_000) }),
]);

export const dropboxReadTool: Tool = {
  schema: {
    name: "dropbox_read",
    description: "Browse, search, or attach bounded text from an authorized Dropbox path. Read-only.",
    parameters: { type: "object", properties: { action: { type: "string", enum: ["list", "search", "read"] }, path: { type: "string" }, query: { type: "string" } }, required: ["action"] },
  },
  describeForSafety: (args) => `read Dropbox ${String(args.path ?? "")}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "dropbox_read needs a valid action and its required path or query." };
    const args = parsed.data;
    try {
      let output: string;
      if (args.action === "list") {
        const value = await listDropbox(args.path);
        output = JSON.stringify(value, null, 2);
      } else if (args.action === "search") {
        const value = await searchDropbox(args.query, args.path);
        output = JSON.stringify(value, null, 2);
      } else {
        const value = await downloadDropbox(args.path);
        output = value.content;
      }
      await appendIntegrationReceipt(ctx.root, { integration: "dropbox", action: "read", outcome: "passed", detail: `${args.action} ${args.path ?? ""}` });
      return { ok: true, output };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await appendIntegrationReceipt(ctx.root, { integration: "dropbox", action: "read", outcome: "failed", detail });
      return { ok: false, output: detail };
    }
  },
};
