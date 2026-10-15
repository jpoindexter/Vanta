import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { platform as osPlatform } from "node:process";
import { ensureVantaStore, resolveVantaHome } from "../store/home.js";
import { getSecret, keychainAvailable, setSecret, type KeychainKey } from "../store/keychain.js";
import { LinkedInCredentialSchema, type LinkedInCredential } from "./contract.js";

const TOKEN_FILE = "linkedin-tokens.json";
const TOKEN_KEY: KeychainKey = { service: "vanta-linkedin", account: "default" };

function tokenPath(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), TOKEN_FILE);
}

export function parseLinkedInCredential(value: unknown): LinkedInCredential | null {
  const parsed = LinkedInCredentialSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseStored(raw: string): LinkedInCredential | null {
  try {
    return parseLinkedInCredential(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function loadLinkedInCredential(
  env: NodeJS.ProcessEnv = process.env,
): Promise<LinkedInCredential | null> {
  if (keychainAvailable(env, osPlatform)) {
    const result = await getSecret(TOKEN_KEY);
    return result.ok && result.value ? parseStored(result.value) : null;
  }
  const path = tokenPath(env);
  if (!existsSync(path)) return null;
  return parseStored(await readFile(path, "utf8").catch(() => ""));
}

async function saveFileCredential(
  credential: LinkedInCredential,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  await ensureVantaStore(env);
  const path = tokenPath(env);
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, JSON.stringify(credential, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, path);
  await chmod(path, 0o600);
}

export async function saveLinkedInCredential(
  credential: LinkedInCredential,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const validated = LinkedInCredentialSchema.parse(credential);
  if (!keychainAvailable(env, osPlatform)) return saveFileCredential(validated, env);
  const result = await setSecret(TOKEN_KEY, JSON.stringify(validated));
  if (!result.ok) throw new Error("Could not save LinkedIn authorization in the system keychain.");
}
