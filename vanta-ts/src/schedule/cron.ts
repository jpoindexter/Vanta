import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { loadDurableCron } from "./durable-cron.js";

export type CronEntry = {
  id: number;
  cron: string;
  instruction: string;
  status: "active" | "paused";
};

const CRON_FILE = "cron.tsv";
const FIELD_COUNT = 5;

/** Min/max bounds for each cron field, in order: minute hour dom month dow. */
const BOUNDS: readonly [number, number][] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6],
];

/**
 * Expand a single cron field into the set of values it matches within
 * [min, max]. Supports "*", a number, comma lists, "a-b" ranges, and "*\/n"
 * (or "a-b/n") steps. Returns null on any malformed token so the caller can
 * reject the whole expression without throwing.
 */
/** Parse the range portion of a cron part ("*" | "n" | "a-b") → [lo, hi] | null. */
function parseRange(rangePart: string, min: number, max: number): [number, number] | null {
  if (rangePart === "*") return [min, max];
  const ends = rangePart.split("-").map(Number);
  if (ends.some((n) => !Number.isInteger(n))) return null;
  const start = ends[0];
  if (start === undefined) return null;
  return [start, ends.length === 1 ? start : (ends[1] ?? start)];
}

/** Parse one comma-part ("*", "n", "a-b", optional "/step") → [lo, hi, step] | null. */
function parsePart(part: string, min: number, max: number): [number, number, number] | null {
  const [rangePart, stepPart] = part.split("/");
  const step = stepPart === undefined ? 1 : Number(stepPart);
  if (!Number.isInteger(step) || step < 1 || rangePart === undefined) return null;
  const range = parseRange(rangePart, min, max);
  if (!range) return null;
  const [lo, hi] = range;
  return lo < min || hi > max || lo > hi ? null : [lo, hi, step];
}

function parseField(field: string, min: number, max: number): Set<number> | null {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const parsed = parsePart(part, min, max);
    if (!parsed) return null;
    const [lo, hi, step] = parsed;
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return values;
}

/**
 * Match a standard 5-field cron expression against a Date's local fields.
 * Returns false (never throws) on a malformed expression.
 */
export function isDue(cronExpr: string, date: Date): boolean {
  const fields = cronExpr.trim().split(/\s+/);
  if (fields.length !== FIELD_COUNT) return false;

  const actual = [
    date.getMinutes(),
    date.getHours(),
    date.getDate(),
    date.getMonth() + 1,
    date.getDay(),
  ];

  for (let i = 0; i < FIELD_COUNT; i++) {
    const bound = BOUNDS[i];
    const field = fields[i];
    const value = actual[i];
    if (bound === undefined || field === undefined || value === undefined) {
      return false;
    }
    const [min, max] = bound;
    const set = parseField(field, min, max);
    if (set === null || !set.has(value)) return false;
  }
  return true;
}

function cronPath(dataDir: string): string {
  return join(dataDir, CRON_FILE);
}

/** Parse one tsv line into a CronEntry, or null if it is malformed. */
function parseLine(line: string): CronEntry | null {
  const cells = line.split("\t");
  if (cells.length < 4) return null;
  const [idCell, cron, instruction, status] = cells;
  const id = Number(idCell);
  if (
    cron === undefined ||
    instruction === undefined ||
    !Number.isInteger(id) ||
    (status !== "active" && status !== "paused")
  ) {
    return null;
  }
  return { id, cron, instruction, status };
}

/** Read all cron entries from <dataDir>/cron.tsv, or [] if absent. */
export async function loadCron(dataDir: string): Promise<CronEntry[]> {
  let raw = "";
  try {
    raw = await readFile(cronPath(dataDir), "utf8");
  } catch {
    raw = "";
  }
  const entries: CronEntry[] = [];
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    const entry = parseLine(line);
    if (entry !== null) entries.push(entry);
  }
  return [...entries, ...await loadDurableCron(dataDir)];
}

/** Rewrite <dataDir>/cron.tsv with the given entries (creating the dir). */
export async function saveCron(
  dataDir: string,
  entries: CronEntry[],
): Promise<void> {
  const path = cronPath(dataDir);
  await mkdir(dirname(path), { recursive: true });
  const body = entries
    .map((e) => [e.id, e.cron, e.instruction, e.status].join("\t"))
    .join("\n");
  await writeFile(path, body === "" ? "" : `${body}\n`, "utf8");
}

/** Append a new active entry (id = max existing + 1), persist, and return it. */
export async function addCron(
  dataDir: string,
  cron: string,
  instruction: string,
): Promise<CronEntry> {
  const entries = await loadCron(dataDir);
  const nextId = entries.reduce((max, e) => Math.max(max, e.id), 0) + 1;
  const entry: CronEntry = { id: nextId, cron, instruction, status: "active" };
  entries.push(entry);
  await saveCron(dataDir, entries);
  return entry;
}
