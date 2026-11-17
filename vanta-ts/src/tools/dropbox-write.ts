import { z } from "zod";
import { uploadDropbox } from "../integrations/dropbox.js";
import { appendIntegrationReceipt } from "../integrations/receipts.js";
import type { Tool } from "./types.js";

const Args = z.object({ path: z.string().min(1).max(2_000), content: z.string().max(1_000_000), mode: z.enum(["add", "update"]).default("add"), rev: z.string().min(1).optional() }).refine((value) => value.mode === "add" || value.rev, "mode update requires rev");

export const dropboxWriteTool: Tool = {
  schema: {
    name: "dropbox_write",
    description: "Upload a Dropbox file, or replace one only with its current revision. Always asks for approval.",
    parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" }, mode: { type: "string", enum: ["add", "update"] }, rev: { type: "string" } }, required: ["path", "content"] },
  },
  describeForSafety: (args) => `write Dropbox ${String(args.path ?? "")}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "dropbox_write needs path, content, and a revision when replacing a file." };
    const args = parsed.data;
    const verb = args.mode === "update" ? "replace" : "upload";
    if (!await ctx.requestApproval(`${verb} a Dropbox file`, `writes ${args.path} in your authorized Dropbox`, "dropbox_write")) return { ok: false, output: "denied by user" };
    try {
      const file = await uploadDropbox(args);
      await appendIntegrationReceipt(ctx.root, { integration: "dropbox", action: "write", outcome: "passed", detail: `${verb} ${args.path}` });
      return { ok: true, output: `${verb} succeeded: ${file.pathDisplay ?? file.name} (${file.rev ?? "no revision returned"})` };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await appendIntegrationReceipt(ctx.root, { integration: "dropbox", action: "write", outcome: "failed", detail });
      return { ok: false, output: detail };
    }
  },
};
