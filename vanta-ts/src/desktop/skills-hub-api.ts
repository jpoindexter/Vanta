import { z } from "zod";
import { type HubSkill, type HubSource, materializeHub, searchHub } from "../skills/hub.js";
import { approveRegistrySkill, installRegistrySkill, viewRegistrySkill } from "../skills/registry-client.js";
import {
  type ControlCtx, type ControlTable, approveExactAction, errorText, parseBody, sendFail, sendOk,
} from "./control-http.js";
import { sendJson } from "./handler-http.js";

const SEARCH_LIMIT = 40;
/** Sources a person can search without extra setup. `official` joins only when a registry is configured. */
const OPEN_SOURCES: HubSource[] = ["skills-sh", "github", "tap"];
const SOURCE_NAMES: HubSource[] = ["official", "url", "well-known", "github", "skills-sh", "tap"];

const SearchBody = z.object({ query: z.string().trim().max(200).default(""), source: z.string().trim().default("all") });
const IdentifierBody = z.object({ identifier: z.string().trim().min(3).max(500) });

const env = (ctx: ControlCtx): NodeJS.ProcessEnv => ctx.state._env ?? process.env;

function sourcesFor(requested: string, e: NodeJS.ProcessEnv): HubSource[] {
  if (requested !== "all") return SOURCE_NAMES.filter((name) => name === requested);
  return e.VANTA_SKILL_REGISTRY ? ["official", ...OPEN_SOURCES] : OPEN_SOURCES;
}

const row = (skill: HubSkill) => ({
  identifier: skill.identifier, name: skill.name, description: skill.description, source: skill.source, slug: skill.slug,
  category: skill.category ?? null, provenance: skill.provenance, signature: skill.signature, integrity: skill.integrity,
});

const search: ControlTable[string] = async (ctx) => {
  const body = await parseBody(ctx, SearchBody);
  if (!body) return;
  const e = env(ctx);
  // skills.sh needs a query; with none, only the curated GitHub and tap lists answer.
  const sources = sourcesFor(body.source, e).filter((name) => body.query || name !== "skills-sh");
  const report = await searchHub({ query: body.query, sources, env: e });
  sendJson(ctx.res, 200, { results: report.skills.slice(0, SEARCH_LIMIT).map(row), failures: report.failures });
};

/** Downloads and hashes the package, then reads it back the way an install would see it. */
async function viewPackage(identifier: string, e: NodeJS.ProcessEnv) {
  const materialized = await materializeHub(identifier, { candidates: [], env: e });
  const installEnv = { ...e, VANTA_SKILL_REGISTRY: materialized.registryPath };
  const viewed = await viewRegistrySkill(materialized.slug, installEnv);
  if (!viewed) throw new Error(`hub skill ${identifier} could not be read after download`);

  return { installEnv, slug: materialized.slug, viewed };
}

const preview: ControlTable[string] = async (ctx) => {
  const body = await parseBody(ctx, IdentifierBody);
  if (!body) return;
  try {
    const { slug, viewed } = await viewPackage(body.identifier, env(ctx));
    sendJson(ctx.res, 200, {
      identifier: body.identifier, name: slug, skillMd: viewed.content, version: viewed.version, integrityOk: viewed.integrityOk,
      files: viewed.packageFiles.map((file) => ({ path: file.path, bytes: file.bytes.byteLength })), risks: viewed.risks,
    });
  } catch (error) { sendFail(ctx.res, 502, errorText(error)); }
};

const install: ControlTable[string] = async (ctx) => {
  const body = await parseBody(ctx, IdentifierBody);
  if (!body) return;
  try {
    const { installEnv, slug, viewed } = await viewPackage(body.identifier, env(ctx));
    if (!viewed.integrityOk) return sendFail(ctx.res, 422, `${body.identifier} failed its integrity check; nothing was installed`);
    const risks = viewed.risks.length ? `; risks: ${viewed.risks.join(", ")}` : "";
    const approved = await approveExactAction(ctx, {
      action: `install skill ${body.identifier} (${viewed.packageFiles.length} file(s), sha256:${viewed.sha256.slice(0, 12)}${risks})`,
      reason: "Skills are instructions the agent follows. Installing one adds it to your library and makes it available to the model.",
      toolName: "skill_install",
    });
    if (!approved) return;
    await installRegistrySkill(slug, { env: installEnv, confirmed: true });
    const active = await approveRegistrySkill(slug, installEnv);
    sendOk(ctx.res, { name: slug, status: active.status, version: active.version });
  } catch (error) { sendFail(ctx.res, 409, errorText(error)); }
};

export const skillsHubPost: ControlTable = {
  "/api/skills/hub-search": search, "/api/skills/hub-preview": preview, "/api/skills/hub-install": install,
};
