import { z } from "zod";

const PackagePath = z.string().min(1).max(240).refine(
  (path) => !path.startsWith("/") && !path.includes("\\") && !path.split("/").includes("..") && !path.split("/").includes(""),
  "package path must be a contained relative path",
);

export const RegistryPackageFileSchema = z.object({
  path: PackagePath, source: z.string().min(1).max(500), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().nonnegative().max(524_288), executable: z.boolean().default(false),
}).strict();
export type RegistryPackageFile = z.infer<typeof RegistryPackageFileSchema>;

export const RegistrySkillSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  name: z.string().min(1).max(100), version: z.string().min(1).max(40),
  description: z.string().min(1).max(500), source: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), capabilities: z.array(z.string().min(1).max(100)).max(30).default([]),
  platforms: z.array(z.string().min(1).max(40)).max(20).default([]),
  dependencies: z.array(z.string().min(1).max(120)).max(50).default([]),
  files: z.array(RegistryPackageFileSchema).max(64).default([]),
}).strict();
export type RegistrySkill = z.infer<typeof RegistrySkillSchema>;

export const RegistryIndexSchema = z.object({ version: z.literal(1), skills: z.array(RegistrySkillSchema) }).strict();

export const RegistryInstallSchema = z.object({
  slug: z.string(), version: z.string(), source: z.string(), sha256: z.string(), installedSha256: z.string(),
  files: z.array(z.object({ path: PackagePath, sha256: z.string().regex(/^[a-f0-9]{64}$/) })).default([]),
  status: z.enum(["disabled", "active", "removed"]), updatedAt: z.string().datetime(),
});
export type RegistryInstall = z.infer<typeof RegistryInstallSchema>;
