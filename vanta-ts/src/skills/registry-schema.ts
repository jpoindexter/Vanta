import { z } from "zod";

export const RegistrySkillSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  name: z.string().min(1).max(100), version: z.string().min(1).max(40),
  description: z.string().min(1).max(500), source: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), capabilities: z.array(z.string().min(1).max(100)).max(30).default([]),
}).strict();
export type RegistrySkill = z.infer<typeof RegistrySkillSchema>;

export const RegistryIndexSchema = z.object({ version: z.literal(1), skills: z.array(RegistrySkillSchema) }).strict();

export const RegistryInstallSchema = z.object({
  slug: z.string(), version: z.string(), source: z.string(), sha256: z.string(), installedSha256: z.string(),
  status: z.enum(["disabled", "active", "removed"]), updatedAt: z.string().datetime(),
});
export type RegistryInstall = z.infer<typeof RegistryInstallSchema>;
