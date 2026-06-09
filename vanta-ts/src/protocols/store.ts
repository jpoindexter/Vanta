import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

export const ProtocolSchema = z.object({
  name: z.string(),
  description: z.string(),
  steps: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Protocol = z.infer<typeof ProtocolSchema>;

export const PROTOCOLS_DIR = "protocols";

function protocolsPath(dataDir: string): string {
  return join(dataDir, PROTOCOLS_DIR);
}

function protocolFilePath(dataDir: string, name: string): string {
  return join(protocolsPath(dataDir), `${name}.json`);
}

/** Reads all *.json in <dataDir>/protocols/; returns [] on empty or missing dir. */
export async function listProtocols(dataDir: string): Promise<Protocol[]> {
  const dir = protocolsPath(dataDir);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const results: Protocol[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const raw = await readFile(join(dir, entry), "utf8");
      const parsed = ProtocolSchema.safeParse(JSON.parse(raw));
      if (parsed.success) results.push(parsed.data);
    } catch {
      // skip malformed or unreadable files
    }
  }
  return results;
}

/** Reads <dataDir>/protocols/<name>.json; returns null if missing or invalid. */
export async function readProtocol(dataDir: string, name: string): Promise<Protocol | null> {
  try {
    const raw = await readFile(protocolFilePath(dataDir, name), "utf8");
    const parsed = ProtocolSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Writes <dataDir>/protocols/<name>.json (mkdir -p first). */
export async function writeProtocol(dataDir: string, protocol: Protocol): Promise<void> {
  const dir = protocolsPath(dataDir);
  await mkdir(dir, { recursive: true });
  await writeFile(
    protocolFilePath(dataDir, protocol.name),
    JSON.stringify(protocol, null, 2),
    "utf8",
  );
}

/** Removes <dataDir>/protocols/<name>.json; returns false if missing. */
export async function deleteProtocol(dataDir: string, name: string): Promise<boolean> {
  try {
    await unlink(protocolFilePath(dataDir, name));
    return true;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return false;
    throw err;
  }
}
