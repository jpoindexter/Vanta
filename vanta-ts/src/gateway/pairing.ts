import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

// MSG-PAIRING — code-based DM pairing (consent over allowlists).
// An unknown chatId gets a one-time code instead of being silently dropped.
// The owner approves via CLI. Pure fns for codegen/verify are offline-testable.

export type PairingStatus = "pending" | "approved" | "locked";
export type PairingRecord = {
  chatId: string;
  platform: string;
  code: string;
  issuedAt: number;
  expiresAt: number;
  attempts: number;
  status: PairingStatus;
  approvedAt?: number;
};

export type VerifyResult = "approved" | "expired" | "wrong" | "locked";

// Unambiguous alphabet: no I/O/0/1 confusion.
const ALPHABET = "BCDFGHJKLMNPQRSTVWXYZ2345679";
export const CODE_LENGTH = 6;
export const EXPIRY_MS = 3_600_000; // 1 hour
export const MAX_ATTEMPTS = 5;

/** Generate a random pairing code. Pure (takes a random source for testability). */
export function generateCode(rand?: () => number): string {
  const r = rand ?? Math.random;
  return Array.from({ length: CODE_LENGTH }, () =>
    ALPHABET[Math.floor(r() * ALPHABET.length)] ?? ALPHABET[0],
  ).join("");
}

/** True when a string looks like a pairing code (6 uppercase/digit chars). Pure. */
export function looksLikeCode(text: string): boolean {
  return /^[BCDFGHJKLMNPQRSTVWXYZ2345679]{6}$/.test(text.trim().toUpperCase());
}

function pairingDir(home: string): string {
  return join(home, "pairing");
}

function recordPath(home: string, chatId: string): string {
  const safe = chatId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(pairingDir(home), `${safe}.json`);
}

async function ensureDir(home: string): Promise<void> {
  await mkdir(pairingDir(home), { recursive: true });
}

export async function loadRecord(
  home: string,
  chatId: string,
): Promise<PairingRecord | undefined> {
  const path = recordPath(home, chatId);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(await readFile(path, "utf8")) as PairingRecord;
  } catch {
    return undefined;
  }
}

async function saveRecord(home: string, record: PairingRecord): Promise<void> {
  await ensureDir(home);
  await writeFile(recordPath(home, record.chatId), JSON.stringify(record, null, 2), {
    mode: 0o600,
  });
}

/**
 * Request pairing for a chatId. Reuses an unexpired pending code if one exists.
 * Returns the code to send back to the user.
 */
export async function requestPairing(
  chatId: string,
  platform: string,
  home: string,
  now = Date.now(),
): Promise<string> {
  const existing = await loadRecord(home, chatId);
  // Reuse unexpired pending code
  if (existing && existing.status === "pending" && existing.expiresAt > now) {
    return existing.code;
  }
  const code = generateCode();
  const record: PairingRecord = {
    chatId,
    platform,
    code,
    issuedAt: now,
    expiresAt: now + EXPIRY_MS,
    attempts: 0,
    status: "pending",
  };
  await saveRecord(home, record);
  return code;
}

/**
 * Verify a submitted code. Returns the outcome; updates the record on the way.
 * 'approved' means the code matched and the session is now active.
 */
export async function verifyCode(
  chatId: string,
  code: string,
  home: string,
  now = Date.now(),
): Promise<VerifyResult> {
  const record = await loadRecord(home, chatId);
  if (!record || record.status === "approved") return "approved";
  if (record.status === "locked") return "locked";
  if (record.expiresAt <= now) return "expired";

  const incoming = code.trim().toUpperCase();
  if (incoming !== record.code) {
    const attempts = record.attempts + 1;
    const locked = attempts >= MAX_ATTEMPTS;
    await saveRecord(home, { ...record, attempts, status: locked ? "locked" : "pending" });
    return locked ? "locked" : "wrong";
  }

  await saveRecord(home, { ...record, status: "approved", approvedAt: now });
  return "approved";
}

/** True if the chatId has an approved pairing record. */
export async function isApproved(chatId: string, home: string): Promise<boolean> {
  const record = await loadRecord(home, chatId);
  return record?.status === "approved";
}

/** Owner manually approves a pending chatId from the CLI. */
export async function approvePairing(
  chatId: string,
  platform: string,
  home: string,
  now = Date.now(),
): Promise<boolean> {
  const record = await loadRecord(home, chatId);
  if (!record) return false;
  await saveRecord(home, { ...record, status: "approved", approvedAt: now });
  return true;
}

/** List all pairing records (any status). */
export async function listPairings(home: string): Promise<PairingRecord[]> {
  const dir = pairingDir(home);
  if (!existsSync(dir)) return [];
  const files = await readdir(dir);
  const records: PairingRecord[] = [];
  for (const f of files.filter((f) => f.endsWith(".json"))) {
    try {
      const raw = await readFile(join(dir, f), "utf8");
      records.push(JSON.parse(raw) as PairingRecord);
    } catch {
      /* skip malformed */
    }
  }
  return records;
}
