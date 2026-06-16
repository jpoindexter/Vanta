import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { z } from "zod";
import { resolveVantaHome, ensureVantaStore } from "../store/home.js";

// Token storage for Google OAuth. Extracted from auth.ts (size gate).

const TOKEN_FILE = "google-tokens.json";

/** Defensive shape — token files are external JSON, never trusted blindly. */
const TokenSchema = z
  .object({
    refresh_token: z.string().optional(),
    access_token: z.string().optional(),
    expiry_date: z.number().optional(),
  })
  .passthrough();

export type StoredTokens = z.infer<typeof TokenSchema>;

function tokenPath(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), TOKEN_FILE);
}

/**
 * Defensive parse of an unknown JSON value into the token shape. Returns null
 * for anything that isn't an object with the expected (optional) fields.
 */
export function parseTokenFile(json: unknown): StoredTokens | null {
  const parsed = TokenSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export async function loadTokens(env: NodeJS.ProcessEnv): Promise<StoredTokens | null> {
  const file = tokenPath(env);
  if (!existsSync(file)) return null;
  try {
    return parseTokenFile(JSON.parse(await readFile(file, "utf8")));
  } catch {
    return null;
  }
}

export async function saveTokens(tokens: StoredTokens, env: NodeJS.ProcessEnv): Promise<void> {
  await ensureVantaStore(env);
  // 0o600 — the file holds a refresh_token (a long-lived secret).
  await writeFile(tokenPath(env), JSON.stringify(tokens, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}
