import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { dataDirFor } from "../cli/ops.js";
import { readLearning } from "../learning/ledger.js";
import { isSkillEnabled, readSkillOverrides, setSkillEnabled } from "../skills/enable-state.js";
import { listBundledSkills } from "../skills/library.js";
import { approveRegistrySkill, installRegistrySkill, viewRegistrySkill } from "../skills/registry-client.js";
import { LEARNED_TAG, listSkills } from "../skills/store.js";
import { resolveVantaHome } from "../store/home.js";
import {
  type ControlCtx, type ControlTable, approveExactAction, errorText, parseBody, sendFail, sendOk,
} from "./control-http.js";
import { sendJson } from "./handler-http.js";

const SkillRowSchema = z.object({
  name: z.string(), description: z.string(), category: z.string(), enabled: z.boolean(), usage: z.number().int().nonnegative(),
  provenance: z.enum(["agent", "bundled", "external", "hub"]), tags: z.array(z.string()),
});
export type SkillRow = z.infer<typeof SkillRowSchema>;

const ToggleBody = z.object({ name: z.string().trim().min(1).max(200), enabled: z.boolean() });
const InstallBody = z.object({ slug: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/, "slug must be lowercase letters, digits, '.', '_' or '-'") });
const NO_CATEGORY = "general";

const env = (ctx: ControlCtx): NodeJS.ProcessEnv => ctx.state._env ?? process.env;

async function registrySlugs(e: NodeJS.ProcessEnv): Promise<Set<string>> {
  try {
    const raw = JSON.parse(await readFile(join(resolveVantaHome(e), "skill-registry-installs.json"), "utf8")) as { installs?: Array<{ slug?: string; status?: string }> };
    return new Set((raw.installs ?? []).filter((item) => item.status === "active" && item.slug).map((item) => item.slug as string));
  } catch { return new Set(); }
}

/** Installed skills with their on/off state, where they came from, and how often the loop reused them. */
export async function skillRows(ctx: ControlCtx): Promise<SkillRow[]> {
  const e = env(ctx);
  const [skills, overrides, bundled, registry, ledger] = await Promise.all([
    listSkills(e), readSkillOverrides(e), listBundledSkills({ env: e }).catch(() => []),
    registrySlugs(e), readLearning(dataDirFor(ctx.state.root)).catch(() => []),
  ]);
  const bundledNames = new Set(bundled.map((skill) => skill.meta.name));
  const reuse = new Map<string, number>();
  for (const event of ledger) if (event.kind === "reused") reuse.set(event.skill, (reuse.get(event.skill) ?? 0) + 1);
  return skills.map((skill) => SkillRowSchema.parse({
    name: skill.meta.name, description: skill.meta.description,
    category: skill.meta.tags.find((tag) => tag !== LEARNED_TAG) ?? NO_CATEGORY,
    enabled: isSkillEnabled(skill.meta.name, overrides), usage: reuse.get(skill.meta.name) ?? 0, tags: skill.meta.tags,
    provenance: skill.meta.tags.includes(LEARNED_TAG) ? "agent" : registry.has(skill.meta.name) ? "hub" : bundledNames.has(skill.meta.name) ? "bundled" : "external",
  }));
}

const list: ControlTable[string] = async (ctx) => { sendJson(ctx.res, 200, await skillRows(ctx)); };

const toggle: ControlTable[string] = async (ctx) => {
  const body = await parseBody(ctx, ToggleBody);
  if (!body) return;
  if (!(await listSkills(env(ctx))).some((skill) => skill.meta.name === body.name)) return sendFail(ctx.res, 404, `skill not found: ${body.name}`);
  await setSkillEnabled(body.name, body.enabled, env(ctx));
  sendOk(ctx.res, { name: body.name, enabled: body.enabled });
};

const install: ControlTable[string] = async (ctx) => {
  const body = await parseBody(ctx, InstallBody);
  if (!body) return;
  const e = env(ctx);
  const registry = e.VANTA_SKILL_REGISTRY?.trim();
  if (!registry) return sendFail(ctx.res, 503, "No skill registry is configured. Set VANTA_SKILL_REGISTRY to a registry index file or https URL.");
  try {
    const viewed = await viewRegistrySkill(body.slug, e);
    if (!viewed) return sendFail(ctx.res, 404, `registry has no skill "${body.slug}"`);
    if (!viewed.integrityOk) return sendFail(ctx.res, 422, `registry skill "${body.slug}" failed its integrity check; nothing was installed`);
    const risks = viewed.risks.length ? `; risks: ${viewed.risks.join(", ")}` : "";
    const approved = await approveExactAction(ctx, {
      action: `install skill ${body.slug} v${viewed.version} from ${registry} (sha256:${viewed.sha256.slice(0, 12)}, ${viewed.packageFiles.length} file(s)${risks})`,
      reason: "Skills are instructions the agent follows. Installing one adds it to your library and makes it available to the model.",
      toolName: "skill_install",
    });
    if (!approved) return;
    await installRegistrySkill(body.slug, { env: e, confirmed: true });
    const active = await approveRegistrySkill(body.slug, e);
    sendOk(ctx.res, { name: body.slug, status: active.status, version: active.version });
  } catch (error) { sendFail(ctx.res, 409, errorText(error)); }
};

export const skillsGet: ControlTable = { "/api/skills": list };
export const skillsPost: ControlTable = { "/api/skills/toggle": toggle, "/api/skills/install": install };
