import { readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { listRooms } from "../projects/rooms.js";
import { appendWorld } from "../world/store.js";
import { scanSystemMap, formatSystemMap, type ScanDeps } from "../world/system-map.js";

const exec = promisify(execFile);

// WORLD-MODEL CLI — `vanta world map` scans every repo under the projects dir
// (_active/), detects each one's stack + last-known git state, stores them as
// world entities, and prints the map. The scan logic is pure (system-map.ts);
// this supplies the real fs/git readers.

/** git branch + last-commit subject for a repo dir (nulls when unavailable). */
async function gitStateFor(path: string): Promise<{ branch: string | null; lastCommit: string | null }> {
  const run = async (args: string[]): Promise<string | null> =>
    exec("git", ["-C", path, ...args]).then((r) => r.stdout.trim() || null).catch(() => null);
  const [branch, lastCommit] = await Promise.all([
    run(["rev-parse", "--abbrev-ref", "HEAD"]),
    run(["log", "-1", "--format=%s"]),
  ]);
  return { branch, lastCommit: lastCommit ? lastCommit.slice(0, 60) : null };
}

function buildScanDeps(env: NodeJS.ProcessEnv): ScanDeps {
  const roomPath = new Map<string, string>();
  return {
    listRepos: async () => {
      const rooms = await listRooms(env);
      for (const r of rooms) roomPath.set(r.name, r.path);
      return rooms.map((r) => r.name);
    },
    listFiles: async (repo) => {
      const path = roomPath.get(repo);
      if (!path) return [];
      return readdir(path, { withFileTypes: true }).then((es) => es.map((e) => e.name)).catch(() => []);
    },
    gitState: (repo) => gitStateFor(roomPath.get(repo) ?? repo),
  };
}

export async function runWorldCommand(_repoRoot: string, rest: string[]): Promise<void> {
  if (rest[0] !== "map") {
    console.log("usage: vanta world map   — index _active/ repos (stack + git state) into the world map");
    return;
  }
  const now = new Date().toISOString();
  const entities = await scanSystemMap(buildScanDeps(process.env), now);
  for (const e of entities) await appendWorld(e).catch(() => {});
  console.log(formatSystemMap(entities));
  console.log(`\nStored ${entities.length} repo(s) to the world map (query with /world).`);
}
