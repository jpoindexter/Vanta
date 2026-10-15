import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const FILE = "restart-session.json";
const MAX_AGE_MS = 5 * 60_000;

const RestartHandoffSchema = z.object({
  version: z.literal(1),
  sessionId: z.string().min(1).max(200),
  createdAt: z.string().datetime(),
});

function handoffPath(dataDir: string): string {
  return join(dataDir, FILE);
}

/** Persist only the session identity needed by the next Vanta process. The
 * transcript remains in the permission-restricted session store. */
export async function writeRestartHandoff(dataDir: string, sessionId: string, now = new Date()): Promise<void> {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const path = handoffPath(dataDir);
  const temp = `${path}.${process.pid}.tmp`;
  const body = `${JSON.stringify({ version: 1, sessionId, createdAt: now.toISOString() })}\n`;
  await writeFile(temp, body, { mode: 0o600 });
  await rename(temp, path);
  await chmod(path, 0o600);
}

/** Read-once handoff. Malformed, missing, or stale state fails closed and is
 * removed so an old reload cannot unexpectedly resume later. */
export async function consumeRestartHandoff(dataDir: string, now = new Date()): Promise<string | null> {
  const path = handoffPath(dataDir);
  try {
    const parsed = RestartHandoffSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
    await rm(path, { force: true });
    if (!parsed.success) return null;
    const age = now.getTime() - Date.parse(parsed.data.createdAt);
    if (age < 0 || age > MAX_AGE_MS) return null;
    return parsed.data.sessionId;
  } catch {
    await rm(path, { force: true }).catch(() => {});
    return null;
  }
}
