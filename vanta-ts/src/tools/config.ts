import { z } from "zod";
import type { Tool } from "./types.js";

const Args = z.object({
  action: z.enum(["get", "set"]),
  key: z.string().min(1),
  value: z.string().optional(),
});

const ALLOWED_KEYS = [
  "VANTA_PROVIDER",
  "VANTA_MODEL",
  "VANTA_VISION_MODEL",
  "VANTA_VISION_PROVIDER",
  "VANTA_MODEL_CHEAP",
  "VANTA_MODEL_EXPENSIVE",
  "VANTA_HOME",
  "VANTA_PROJECTS_DIR",
  "VANTA_SPINNER",
  "VANTA_LINT_BLOCK",
];

export const configTool: Tool = {
  schema: {
    name: "config",
    description:
      "Read or write Vanta settings. 'get' returns the current value; " +
      "'set' updates a setting and persists it to .env. " +
      "Only allows whitelisted keys (VANTA_*). Requires approval for writes.",
    parameters: {
      type: "object",
      required: ["action", "key"],
      properties: {
        action: {
          type: "string",
          enum: ["get", "set"],
          description: "Either 'get' to read a setting or 'set' to write it.",
        },
        key: {
          type: "string",
          description: "The setting key (VANTA_* env vars only).",
        },
        value: {
          type: "string",
          description:
            "The new value when action is 'set'. Omit to unset the key.",
        },
      },
    },
  },
  describeForSafety: (args) => {
    const parsed = Args.safeParse(args);
    if (!parsed.success) return "invalid config args";
    const { action, key } = parsed.data;
    return action === "get" ? `read setting ${key}` : `write setting ${key}`;
  },
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: `Invalid args: ${parsed.error.message}` };
    }
    const { action, key, value } = parsed.data;

    if (!ALLOWED_KEYS.includes(key)) {
      return {
        ok: false,
        output: `Key '${key}' is not whitelisted. Allowed: ${ALLOWED_KEYS.join(", ")}`,
      };
    }

    if (action === "get") {
      const val = process.env[key] ?? "(unset)";
      return { ok: true, output: `${key} = ${val}` };
    }

    if (action === "set") {
      if (!value) {
        delete process.env[key];
        return { ok: true, output: `Unset ${key}.` };
      }

      process.env[key] = value;
      return { ok: true, output: `Set ${key} = ${value}.` };
    }

    return { ok: false, output: "Unknown action." };
  },
};
