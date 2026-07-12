import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { ChannelHealth } from "./platforms/channel-supervisor.js";

const SnapshotSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string().datetime(),
  channels: z.array(z.object({ id: z.string(), status: z.enum(["up", "down"]) })),
});

export type GatewayReadinessSnapshot = z.infer<typeof SnapshotSchema>;
const snapshotPath = (dataDir: string): string => join(dataDir, "gateway-readiness.json");

export async function writeGatewayReadiness(dataDir: string, health: ChannelHealth[], now = new Date()): Promise<void> {
  const path = snapshotPath(dataDir);
  const temp = `${path}.${process.pid}.tmp`;
  const snapshot: GatewayReadinessSnapshot = {
    version: 1,
    updatedAt: now.toISOString(),
    channels: health.map(({ id, status }) => ({ id, status })),
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temp, `${JSON.stringify(snapshot)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temp, path);
}

export async function readGatewayReadiness(dataDir: string): Promise<GatewayReadinessSnapshot | null> {
  try {
    const parsed = SnapshotSchema.safeParse(JSON.parse(await readFile(snapshotPath(dataDir), "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
