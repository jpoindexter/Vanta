import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveVantaHome } from "../store/home.js";
import type { LegacySource } from "./types.js";

type SourceSpec = {
  kind: LegacySource["kind"];
  path: string;
  inspect: (raw: string) => { count: number; ids: string[] };
};

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const recordIds = (values: unknown[]): string[] => values.flatMap((value) => {
  if (!value || typeof value !== "object") return [];
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" || typeof id === "number" ? [String(id)] : [];
});

function jsonRecords(key: string) {
  return (raw: string): { count: number; ids: string[] } => {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const records = Array.isArray(value[key]) ? value[key] : [];
    return { count: records.length, ids: recordIds(records) };
  };
}

function jsonLines(raw: string): { count: number; ids: string[] } {
  const records = raw.split("\n").filter(Boolean).map((line) => JSON.parse(line) as unknown);
  return { count: records.length, ids: recordIds(records) };
}

async function fileSource(spec: SourceSpec): Promise<LegacySource> {
  let raw: string;
  try {
    raw = await readFile(spec.path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return {
      kind: spec.kind,
      readOnly: true,
      count: 0,
      ids: [],
      sha256: hash(""),
      ...(code && code !== "ENOENT" ? { error: `${code}: unreadable` } : {}),
    };
  }
  try {
    return { kind: spec.kind, readOnly: true, ...spec.inspect(raw), sha256: hash(raw) };
  } catch {
    return { kind: spec.kind, readOnly: true, count: 0, ids: [], sha256: hash(raw), error: "invalid JSON: unreadable" };
  }
}

async function directorySource(kind: "runs" | "sessions", path: string): Promise<LegacySource> {
  try {
    const names = (await readdir(path)).filter((name) => name.endsWith(".json")).sort();
    const rows = await Promise.all(names.map(async (name) => `${name}:${hash(await readFile(join(path, name), "utf8"))}`));
    return { kind, readOnly: true, count: names.length, ids: names.map((name) => name.slice(0, -5)), sha256: hash(rows.join("\n")) };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return { kind, readOnly: true, count: 0, ids: [], sha256: hash(""), ...(code && code !== "ENOENT" ? { error: `${code}: unreadable` } : {}) };
  }
}

export async function reconcileLegacySources(root: string, env: NodeJS.ProcessEnv): Promise<LegacySource[]> {
  const dataDir = join(root, ".vanta");
  const home = resolveVantaHome(env);
  return Promise.all([
    fileSource({ kind: "tickets", path: join(dataDir, "tickets.json"), inspect: jsonRecords("tickets") }),
    fileSource({ kind: "schedules", path: join(dataDir, "scheduled_tasks.json"), inspect: jsonRecords("tasks") }),
    fileSource({ kind: "work_items", path: join(dataDir, "work-items.jsonl"), inspect: jsonLines }),
    directorySource("runs", join(home, "runs")),
    directorySource("sessions", join(home, "sessions")),
  ]);
}
