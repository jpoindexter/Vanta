import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { generateCode } from "../gateway/pairing.js";

const PAIRING_TTL_MS = 10 * 60_000;
const MAX_PAIRING_ATTEMPTS = 5;
const PairingSchema = z.object({ codeHash: z.string(), expiresAt: z.number(), attempts: z.number().int().nonnegative() });
const DeviceSchema = z.object({ id: z.string(), name: z.string(), tokenHash: z.string(), createdAt: z.string(), lastSeenAt: z.string() });
const StoreSchema = z.object({ version: z.literal(1), devices: z.array(DeviceSchema).default([]) });

type Store = z.infer<typeof StoreSchema>;
export type CompanionDevice = Omit<z.infer<typeof DeviceSchema>, "tokenHash">;

function pairingPath(home: string): string { return join(home, "companion-pairing.json"); }
function tokenPath(home: string): string { return join(home, "companion-tokens.json"); }
function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }

async function atomicJson(path: string, value: unknown): Promise<void> {
  const temp = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temp, path);
}

async function loadStore(home: string): Promise<Store> {
  try { return StoreSchema.parse(JSON.parse(await readFile(tokenPath(home), "utf8"))); }
  catch { return { version: 1, devices: [] }; }
}

export async function startCompanionPairing(home: string, now = Date.now(), rand?: () => number): Promise<{ code: string; expiresAt: number }> {
  const code = generateCode(rand);
  const expiresAt = now + PAIRING_TTL_MS;
  await atomicJson(pairingPath(home), { codeHash: hash(code), expiresAt, attempts: 0 });
  return { code, expiresAt };
}

export async function exchangeCompanionCode(home: string, code: string, name: string, now = Date.now()): Promise<{ token: string; device: CompanionDevice } | { error: string }> {
  let pairing: z.infer<typeof PairingSchema>;
  try { pairing = PairingSchema.parse(JSON.parse(await readFile(pairingPath(home), "utf8"))); }
  catch { return { error: "pairing not started" }; }
  if (pairing.expiresAt <= now) return { error: "pairing code expired" };
  if (pairing.attempts >= MAX_PAIRING_ATTEMPTS) return { error: "pairing locked" };
  if (!safeEqual(pairing.codeHash, hash(code.trim().toUpperCase()))) {
    await atomicJson(pairingPath(home), { ...pairing, attempts: pairing.attempts + 1 });
    return { error: pairing.attempts + 1 >= MAX_PAIRING_ATTEMPTS ? "pairing locked" : "incorrect pairing code" };
  }
  const token = randomBytes(32).toString("base64url");
  const at = new Date(now).toISOString();
  const device = { id: randomBytes(12).toString("hex"), name: name.trim().slice(0, 80) || "Mobile companion", createdAt: at, lastSeenAt: at };
  const store = await loadStore(home);
  await atomicJson(tokenPath(home), { version: 1, devices: [...store.devices, { ...device, tokenHash: hash(token) }] });
  await writeFile(pairingPath(home), "", { mode: 0o600 });
  return { token, device };
}

export async function authenticateCompanion(home: string, token: string | undefined, now = Date.now()): Promise<CompanionDevice | null> {
  if (!token) return null;
  const store = await loadStore(home);
  const match = store.devices.find((device) => safeEqual(device.tokenHash, hash(token)));
  if (!match) return null;
  if (now - Date.parse(match.lastSeenAt) < 60_000) {
    const { tokenHash: _secret, ...device } = match;
    return device;
  }
  const updated = { ...match, lastSeenAt: new Date(now).toISOString() };
  await atomicJson(tokenPath(home), { version: 1, devices: store.devices.map((device) => device.id === match.id ? updated : device) });
  const { tokenHash: _secret, ...device } = updated;
  return device;
}

export async function listCompanionDevices(home: string): Promise<CompanionDevice[]> {
  return (await loadStore(home)).devices.map(({ tokenHash: _secret, ...device }) => device);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
