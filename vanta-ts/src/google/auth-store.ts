import { join } from "node:path";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { platform as osPlatform } from "node:process";
import { z } from "zod";
import { resolveVantaHome, ensureVantaStore } from "../store/home.js";
import {
  keychainAvailable,
  setSecret,
  getSecret,
  type KeychainKey,
} from "../store/keychain.js";
import type { ClientCreds } from "./client-json.js";

// Token storage for Google OAuth. Extracted from auth.ts (size gate).
// Persistence is keychain-backed when opt-in (macOS + VANTA_KEYCHAIN=1),
// else the default 0600 JSON file — identical file behavior when off.

const TOKEN_FILE = "google-tokens.json";
const CLIENT_FILE = "google-client.json";

/** macOS Keychain item the Google token JSON is stored under when opt-in. */
const KEYCHAIN_KEY: KeychainKey = {
  service: "vanta-google-tokens",
  account: "default",
};
const CLIENT_KEYCHAIN_KEY: KeychainKey = {
  service: "vanta-google-client",
  account: "default",
};

/** Defensive shape — token files are external JSON, never trusted blindly. */
const TokenSchema = z
  .object({
    refresh_token: z.string().optional(),
    access_token: z.string().optional(),
    expiry_date: z.number().optional(),
  })
  .passthrough();

export type StoredTokens = z.infer<typeof TokenSchema>;
const ClientCredsSchema = z.object({ clientId: z.string().min(1), clientSecret: z.string().min(1) });

function tokenPath(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), TOKEN_FILE);
}

function clientPath(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), CLIENT_FILE);
}

/**
 * Defensive parse of an unknown JSON value into the token shape. Returns null
 * for anything that isn't an object with the expected (optional) fields.
 */
export function parseTokenFile(json: unknown): StoredTokens | null {
  const parsed = TokenSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** Parse a stored JSON blob (from file or keychain) into tokens, tolerant. */
function parseStored(raw: string): StoredTokens | null {
  try {
    return parseTokenFile(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function loadTokens(env: NodeJS.ProcessEnv): Promise<StoredTokens | null> {
  if (keychainAvailable(env, osPlatform)) {
    const got = await getSecret(KEYCHAIN_KEY);
    if (got.ok && got.value) return parseStored(got.value);
    return null;
  }
  const file = tokenPath(env);
  if (!existsSync(file)) return null;
  return parseStored(await readFile(file, "utf8").catch(() => "{"));
}

export async function saveTokens(tokens: StoredTokens, env: NodeJS.ProcessEnv): Promise<void> {
  if (keychainAvailable(env, osPlatform)) {
    await setSecret(KEYCHAIN_KEY, JSON.stringify(tokens));
    return;
  }
  await ensureVantaStore(env);
  // 0o600 — the file holds a refresh_token (a long-lived secret).
  await writeFile(tokenPath(env), JSON.stringify(tokens, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

export async function loadClientCreds(env: NodeJS.ProcessEnv): Promise<ClientCreds | null> {
  let raw: string | null = null;
  if (keychainAvailable(env, osPlatform)) {
    const got = await getSecret(CLIENT_KEYCHAIN_KEY);
    raw = got.ok ? got.value : null;
  } else if (existsSync(clientPath(env))) {
    raw = await readFile(clientPath(env), "utf8").catch(() => null);
  }
  if (!raw) return null;
  try {
    const parsed = ClientCredsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function saveClientCreds(creds: ClientCreds, env: NodeJS.ProcessEnv): Promise<void> {
  const payload = JSON.stringify(ClientCredsSchema.parse(creds));
  if (keychainAvailable(env, osPlatform)) {
    const saved = await setSecret(CLIENT_KEYCHAIN_KEY, payload);
    if (!saved.ok) throw new Error("Could not save Google OAuth client credentials in the system keychain.");
    return;
  }
  await ensureVantaStore(env);
  const file = clientPath(env);
  await writeFile(file, payload, { encoding: "utf8", mode: 0o600 });
  await chmod(file, 0o600);
}
