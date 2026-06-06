import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";

// Persistent "always allow <tool>" list for the approval prompt — the only
// approval choice that must outlive the session. once/session live in app
// memory; the kernel has no always-allow primitive, so this is the right layer.
// Plain JSON at ~/.vanta/approvals.json, consistent with sessions/skills storage.

const FILE = "approvals.json";
const Schema = z.object({ alwaysAllow: z.array(z.string()) });

function filePath(env?: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), FILE);
}

/** Tool names the user has chosen to always allow. Empty on any read error. */
export async function loadAlwaysAllow(env?: NodeJS.ProcessEnv): Promise<string[]> {
  try {
    const parsed = Schema.safeParse(JSON.parse(await readFile(filePath(env), "utf8")));
    return parsed.success ? parsed.data.alwaysAllow : [];
  } catch {
    return [];
  }
}

/** Add a tool to the always-allow list (idempotent). */
export async function addAlwaysAllow(tool: string, env?: NodeJS.ProcessEnv): Promise<void> {
  const current = await loadAlwaysAllow(env);
  if (current.includes(tool)) return;
  const dir = resolveVantaHome(env);
  await mkdir(dir, { recursive: true });
  await writeFile(filePath(env), JSON.stringify({ alwaysAllow: [...current, tool] }, null, 2), "utf8");
}
