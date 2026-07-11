import { z } from "zod";

const FieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  default: z.string().optional(),
});

const BaseSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]+$/),
  description: z.string().min(1),
  fields: z.array(FieldSchema).default([]),
});

const ScheduleSchema = BaseSchema.extend({
  kind: z.literal("schedule"),
  schedule: z.object({ cron: z.string().min(1), instruction: z.string().min(1) }),
});

const WebhookSchema = BaseSchema.extend({
  kind: z.literal("webhook"),
  webhook: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    template: z.enum(["github-pr", "email", "subscriber", "generic"]),
    prompt: z.string().optional(),
    deliver: z.string().min(1),
  }),
});

export const AutomationBlueprintSchema = z.discriminatedUnion("kind", [ScheduleSchema, WebhookSchema]);
export type AutomationBlueprint = z.infer<typeof AutomationBlueprintSchema>;

export function parseAutomationBlueprint(value: unknown): AutomationBlueprint | null {
  const parsed = AutomationBlueprintSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
