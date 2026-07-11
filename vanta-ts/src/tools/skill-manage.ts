import { z } from "zod";
import type { Tool } from "./types.js";
import { submitAgentSkillMutation, type SkillMutation } from "../skills/write-approval.js";

const Args = z.object({
  action: z.enum(["create", "edit", "patch", "delete", "write_file", "remove_file"]),
  name: z.string().optional(), description: z.string().optional(), body: z.string().optional(), tags: z.array(z.string()).optional(),
  slug: z.string().optional(), oldString: z.string().optional(), newString: z.string().optional(), path: z.string().optional(), content: z.string().optional(),
});

export const skillManageTool: Tool = {
  schema: {
    name: "skill_manage",
    description: "Create, edit, patch, archive, or change supporting files in a reusable skill. Agent mutations may be staged for operator approval.",
    parameters: { type: "object", properties: {
      action: { type: "string", enum: ["create", "edit", "patch", "delete", "write_file", "remove_file"] },
      name: { type: "string" }, description: { type: "string" }, body: { type: "string" }, tags: { type: "array", items: { type: "string" } },
      slug: { type: "string" }, oldString: { type: "string" }, newString: { type: "string" }, path: { type: "string" }, content: { type: "string" },
    }, required: ["action"] },
  },
  describeForSafety: (args) => `manage vanta skill (${String(args.action ?? "unknown")})`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw); if (!parsed.success) return { ok: false, output: "skill_manage needs a valid action and fields" };
    try {
      const mutation = toMutation(parsed.data), result = await submitAgentSkillMutation(mutation, {
        root: ctx.root || process.cwd(), env: process.env, sessionId: ctx.sessionId, reason: `agent skill_manage ${mutation.action}`,
      });
      return { ok: true, output: result.status === "staged" ? `staged ${mutation.action} for approval (${result.id})` : `applied ${mutation.action} to skill` };
    } catch (error) { return { ok: false, output: (error as Error).message }; }
  },
};

function toMutation(args: z.infer<typeof Args>): SkillMutation {
  if (args.action === "create" || args.action === "edit") return writeMutation(args);
  if (!args.slug) throw new Error(`${args.action} needs slug`);
  if (args.action === "patch") return patchMutation(args, args.slug);
  if (args.action === "delete") return { action: "delete", slug: args.slug };
  if (!args.path) throw new Error(`${args.action} needs path`);
  if (args.action === "write_file") return fileMutation(args, args.slug, args.path);
  return { action: "remove_file", slug: args.slug, path: args.path };
}

function writeMutation(args: z.infer<typeof Args>): SkillMutation {
  if (!args.name || !args.description || !args.body || (args.action !== "create" && args.action !== "edit")) throw new Error(`${args.action} needs name, description, and body`);
  return { action: args.action, input: { name: args.name, description: args.description, body: args.body, tags: args.tags } };
}

function patchMutation(args: z.infer<typeof Args>, slug: string): SkillMutation {
  if (!args.oldString || args.newString === undefined) throw new Error("patch needs oldString and newString");
  return { action: "patch", slug, oldString: args.oldString, newString: args.newString };
}

function fileMutation(args: z.infer<typeof Args>, slug: string, path: string): SkillMutation {
  if (args.content === undefined) throw new Error("write_file needs content"); return { action: "write_file", slug, path, content: args.content };
}
