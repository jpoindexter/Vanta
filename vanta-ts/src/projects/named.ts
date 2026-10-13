import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, normalize } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";

const FILE = "projects.json";
export const MAX_PROJECT_NAME = 80;

export const NamedProjectSchema = z.object({
  id: z.string().regex(/^p_[a-f0-9]{8,}$/),
  name: z.string().min(1).max(MAX_PROJECT_NAME),
  path: z.string().min(1),
  createdAt: z.string().min(1),
});
export type NamedProject = z.infer<typeof NamedProjectSchema>;

const StoreSchema = z.object({ version: z.literal(1), projects: z.array(NamedProjectSchema), activeId: z.string().nullable() });
type Store = z.infer<typeof StoreSchema>;

/** A project row as the list shows it: stored ones and the one derived from the working folder. */
export type ProjectEntry = NamedProject & { derived: boolean };

const storePath = (env?: NodeJS.ProcessEnv): string => join(resolveVantaHome(env), FILE);

async function load(env?: NodeJS.ProcessEnv): Promise<Store> {
  try {
    const parsed = StoreSchema.safeParse(JSON.parse(await readFile(storePath(env), "utf8")));
    if (parsed.success) return parsed.data;
  } catch { /* absent or torn: start empty */ }
  return { version: 1, projects: [], activeId: null };
}

async function save(store: Store, env?: NodeJS.ProcessEnv): Promise<void> {
  const path = storePath(env);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Stored projects plus, unless one already covers it, an entry derived from the working folder so
 * a fresh install still shows where it is. The derived entry's id is its path and it is never stored.
 */
export async function listProjects(cwd: string, env?: NodeJS.ProcessEnv): Promise<{ projects: ProjectEntry[]; activeId: string | null }> {
  const store = await load(env);
  const stored: ProjectEntry[] = store.projects.map((project) => ({ ...project, derived: false }));
  const covered = store.projects.some((project) => project.path === cwd);
  const derived: ProjectEntry[] = covered ? [] : [{ id: cwd, name: basename(cwd) || cwd, path: cwd, createdAt: "", derived: true }];
  return { projects: [...stored, ...derived], activeId: store.activeId };
}

export type ProjectResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 404 | 409; error: string };

async function checkedFolder(path: string): Promise<string | null> {
  if (!isAbsolute(path)) return "project folder must be an absolute path";
  try { return (await stat(path)).isDirectory() ? null : `${path} is not a folder`; } catch { return `${path} does not exist`; }
}

function checkedName(name: string, others: NamedProject[]): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "project name is required";
  if (trimmed.length > MAX_PROJECT_NAME) return `project name must be ${MAX_PROJECT_NAME} characters or fewer`;
  return others.some((project) => same(project.name, trimmed)) ? `a project named "${trimmed}" already exists` : null;
}

export async function createProject(input: { name: string; path: string; now?: Date }, env?: NodeJS.ProcessEnv): Promise<ProjectResult<NamedProject>> {
  const path = normalize(input.path);
  const store = await load(env);
  const problem = checkedName(input.name, store.projects) ?? await checkedFolder(path);
  if (problem) return { ok: false, status: problem.includes("already exists") ? 409 : 400, error: problem };
  const project: NamedProject = { id: `p_${randomBytes(6).toString("hex")}`, name: input.name.trim(), path, createdAt: (input.now ?? new Date()).toISOString() };
  await save({ ...store, projects: [...store.projects, project] }, env);
  return { ok: true, value: project };
}

export async function renameProject(id: string, name: string, env?: NodeJS.ProcessEnv): Promise<ProjectResult<NamedProject>> {
  const store = await load(env);
  const target = store.projects.find((project) => project.id === id);
  if (!target) return { ok: false, status: 404, error: `project not found: ${id}` };
  const problem = checkedName(name, store.projects.filter((project) => project.id !== id));
  if (problem) return { ok: false, status: problem.includes("already exists") ? 409 : 400, error: problem };
  const renamed = { ...target, name: name.trim() };
  await save({ ...store, projects: store.projects.map((project) => (project.id === id ? renamed : project)) }, env);
  return { ok: true, value: renamed };
}

/** Removes the record only; the folder and its sessions are untouched. */
export async function deleteProject(id: string, env?: NodeJS.ProcessEnv): Promise<ProjectResult<{ activeId: string | null }>> {
  const store = await load(env);
  if (!store.projects.some((project) => project.id === id)) return { ok: false, status: 404, error: `project not found: ${id}` };
  const activeId = store.activeId === id ? null : store.activeId;
  await save({ ...store, projects: store.projects.filter((project) => project.id !== id), activeId }, env);
  return { ok: true, value: { activeId } };
}

/** `null` clears the active project. A stored id or a derived (path) id may be active. */
export async function setActiveProject(id: string | null, cwd: string, env?: NodeJS.ProcessEnv): Promise<ProjectResult<{ activeId: string | null }>> {
  const store = await load(env);
  if (id !== null && id !== cwd && !store.projects.some((project) => project.id === id)) return { ok: false, status: 404, error: `project not found: ${id}` };
  await save({ ...store, activeId: id }, env);
  return { ok: true, value: { activeId: id } };
}
