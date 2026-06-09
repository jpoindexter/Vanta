import { z } from "zod";
import type { Tool } from "./types.js";

const Args = z.object({
  message: z.string().min(1),
  status: z.enum(["normal", "proactive"]).default("normal"),
  files: z.array(z.string()).optional(),
});

export const briefTool: Tool = {
  schema: {
    name: "brief",
    description:
      "Send a structured notification message with optional file attachments. " +
      "Use 'normal' for routine updates or 'proactive' for agent-initiated alerts. " +
      "Files are referenced by path and rendered in the user interface.",
    parameters: {
      type: "object",
      required: ["message"],
      properties: {
        message: {
          type: "string",
          description: "The notification message (markdown-safe).",
        },
        status: {
          type: "string",
          enum: ["normal", "proactive"],
          description: "Message type: 'normal' or 'proactive' (unsolicited alert).",
        },
        files: {
          type: "array",
          items: { type: "string" },
          description: "Optional file paths to attach (relative or absolute).",
        },
      },
    },
  },
  describeForSafety: () => "send a notification",
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: `Invalid args: ${parsed.error.message}` };
    }
    const { message, status, files } = parsed.data;

    let output = `[${status.toUpperCase()}] ${message}`;
    if (files?.length) {
      output += `\n\nAttachments: ${files.join(", ")}`;
    }

    return { ok: true, output };
  },
};
