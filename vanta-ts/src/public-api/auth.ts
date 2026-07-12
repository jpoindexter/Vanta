import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";

const TokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  tokenHash: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().optional(),
  revokedAt: z.string().optional(),
});
const StoreSchema = z.object({ version: z.literal(1), tokens: z.array(TokenSchema).default([]) });

type StoredToken = z.infer<typeof TokenSchema>;
type TokenStore = z.infer<typeof StoreSchema>;
export type PublicApiToken = Omit<StoredToken, "tokenHash">;

function storePath(home: string): string { return join(home, "public-api-tokens.json"); }
function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }

async function loadStore(home: string): Promise<TokenStore> {
  try { return StoreSchema.parse(JSON.parse(await readFile(storePath(home), "utf8"))); }
  catch { return { version: 1, tokens: [] }; }
}

async function saveStore(home: string, store: TokenStore): Promise<void> {
  const path = storePath(home);
  const temp = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temp, `${JSON.stringify(StoreSchema.parse(store), null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temp, path);
}

export async function issuePublicApiToken(home: string, name: string, now = Date.now()): Promise<{ token: string; record: PublicApiToken }> {
  const token = `vta_${randomBytes(32).toString("base64url")}`;
  const stored: StoredToken = {
    id: randomBytes(8).toString("hex"),
    name: name.trim().slice(0, 80) || "API client",
    tokenHash: hash(token),
    createdAt: new Date(now).toISOString(),
  };
  const store = await loadStore(home);
  await saveStore(home, { version: 1, tokens: [...store.tokens, stored] });
  return { token, record: publicRecord(stored) };
}

export async function authenticatePublicApiToken(
  home: string,
  token: string | undefined,
  now = Date.now(),
  options: { touch?: boolean } = {},
): Promise<PublicApiToken | null> {
  if (!token) return null;
  const store = await loadStore(home);
  const match = store.tokens.find((entry) => !entry.revokedAt && safeEqual(entry.tokenHash, hash(token)));
  if (!match) return null;
  if (options.touch === false) return publicRecord(match);
  if (match.lastUsedAt && now - Date.parse(match.lastUsedAt) < 60_000) return publicRecord(match);
  const updated = { ...match, lastUsedAt: new Date(now).toISOString() };
  await saveStore(home, { version: 1, tokens: store.tokens.map((entry) => entry.id === match.id ? updated : entry) });
  return publicRecord(updated);
}

export async function listPublicApiTokens(home: string): Promise<PublicApiToken[]> {
  return (await loadStore(home)).tokens.map(publicRecord);
}

export async function revokePublicApiToken(home: string, id: string, now = Date.now()): Promise<PublicApiToken | null> {
  const store = await loadStore(home);
  const found = store.tokens.find((entry) => entry.id === id && !entry.revokedAt);
  if (!found) return null;
  const revoked = { ...found, revokedAt: new Date(now).toISOString() };
  await saveStore(home, { version: 1, tokens: store.tokens.map((entry) => entry.id === id ? revoked : entry) });
  return publicRecord(revoked);
}

function publicRecord(token: StoredToken): PublicApiToken {
  const { tokenHash: _secret, ...record } = token;
  return record;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
