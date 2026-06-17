import { resolveMemoryStore } from "../store/memory-store.js";
import { LifeOsSchema, type LifeOs } from "./schema.js";

// Life OS store: reads/writes ~/.vanta/life-os.json.
// Single file, full rewrite on each save (schema is small, JSON is fine).

const LIFE_OS_PATH = "life-os.json";

/** Load the Life OS store, returning defaults if the file is missing or invalid. */
export async function loadLifeOs(env?: NodeJS.ProcessEnv): Promise<LifeOs> {
  const store = resolveMemoryStore(env ?? process.env);
  const raw = await store.read(LIFE_OS_PATH);
  if (raw === null) return LifeOsSchema.parse({});
  try {
    return LifeOsSchema.parse(JSON.parse(raw));
  } catch {
    return LifeOsSchema.parse({});
  }
}

/** Write the Life OS store. */
export async function saveLifeOs(data: LifeOs, env?: NodeJS.ProcessEnv): Promise<void> {
  const store = resolveMemoryStore(env ?? process.env);
  await store.write(
    LIFE_OS_PATH,
    JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 2) + "\n",
  );
}

/** Add or update an item in a list by id. Pure. */
export function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx >= 0) { const out = [...list]; out[idx] = item; return out; }
  return [...list, item];
}

/** Remove an item by id. Pure. */
export function removeById<T extends { id: string }>(list: T[], id: string): T[] {
  return list.filter((x) => x.id !== id);
}

/** Format a summary of the Life OS store for the /brief command. Pure. */
export function formatLifeOsSummary(data: LifeOs): string {
  const lines: string[] = [];
  const activeProjects = data.projects.filter((p) => p.status === "active");
  if (activeProjects.length) lines.push(`Projects: ${activeProjects.map((p) => p.name).join(", ")}`);
  const activeTasks = data.tasks.filter((t) => t.status === "active" || t.status === "pending");
  if (activeTasks.length) lines.push(`Tasks: ${activeTasks.slice(0, 3).map((t) => t.title).join("; ")}${activeTasks.length > 3 ? ` +${activeTasks.length - 3} more` : ""}`);
  const openOpps = data.opportunities.filter((o) => o.status === "active" || o.status === "lead");
  if (openOpps.length) lines.push(`Opportunities: ${openOpps.length} open`);
  const totalRevenue = data.revenue.reduce((s, r) => s + r.amount, 0);
  if (totalRevenue > 0) lines.push(`Revenue on record: $${totalRevenue.toLocaleString()}`);
  const activeRisks = data.risks.filter((r) => r.severity === "high");
  if (activeRisks.length) lines.push(`High risks: ${activeRisks.map((r) => r.description.slice(0, 40)).join("; ")}`);
  return lines.join("\n") || "(life-os empty — populate with vanta life-os add)";
}
