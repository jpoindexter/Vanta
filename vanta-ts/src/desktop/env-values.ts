import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { upsertEnvMigratingLegacy } from "../setup.js";

const KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
// A custom connector must not be able to redirect the runtime itself through a setting name.
const RESERVED_KEY = /^(PATH|HOME|SHELL|USER|TMPDIR|NODE_.*|LD_.*|DYLD_.*|VANTA_.*|NPM_.*|ELECTRON_.*)$/;
const MAX_VALUES = 20;
const MAX_VALUE_CHARS = 16_000;

function assertKey(key: string, allowed?: readonly string[]): void {
  if (allowed) {
    if (!allowed.includes(key)) throw new Error(`${key} is not a setting of this connector (expected: ${allowed.join(", ") || "none"}).`);
    return;
  }
  if (!KEY_PATTERN.test(key) || RESERVED_KEY.test(key)) {
    throw new Error(`${key} is not an allowed setting name. Use capitals, digits and underscores, and not a system or Vanta name.`);
  }
}

function cleanValue(key: string, raw: unknown): string {
  if (typeof raw !== "string") throw new Error(`${key} must be text.`);
  const value = raw.trim();
  if (value.length > MAX_VALUE_CHARS) throw new Error(`${key} is too long.`);
  return value;
}

/** Settings the owner typed for a connector: names like GITHUB_TOKEN with non-empty text values. */
export function parseEnvValues(input: unknown, allowed?: readonly string[]): Record<string, string> {
  if (input === undefined || input === null) return {};
  if (typeof input !== "object" || Array.isArray(input)) throw new Error("Connector settings must be a set of NAME: value pairs.");
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > MAX_VALUES) throw new Error(`A connector can take at most ${MAX_VALUES} settings.`);
  const values: Record<string, string> = {};
  for (const [key, raw] of entries) {
    assertKey(key, allowed);
    const value = cleanValue(key, raw);
    if (value) values[key] = value;
  }
  return values;
}

/** Saves the values to the project's private .env (0600) and into this process, as messaging credentials are. */
export async function saveEnvValues(root: string, values: Record<string, string>): Promise<void> {
  if (!Object.keys(values).length) return;
  const path = join(root, ".vanta", ".env");
  await mkdir(join(root, ".vanta"), { recursive: true });
  const existing = existsSync(path) ? await readFile(path, "utf8") : "";
  await writeFile(path, upsertEnvMigratingLegacy(existing, values), { mode: 0o600 });
  Object.assign(process.env, values);
}
