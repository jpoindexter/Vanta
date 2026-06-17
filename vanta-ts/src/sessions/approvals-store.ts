import { z } from "zod";
import { resolveMemoryStore } from "../store/memory-store.js";

// Persistent "always allow <tool>" list for the approval prompt — the only
// approval choice that must outlive the session. once/session live in app
// memory; the kernel has no always-allow primitive, so this is the right layer.
// Plain JSON at ~/.vanta/approvals.json, consistent with sessions/skills storage.

const FILE = "approvals.json";
const Schema = z.object({ alwaysAllow: z.array(z.string()) });

/** Tool names the user has chosen to always allow. Empty on any read error. */
export async function loadAlwaysAllow(env?: NodeJS.ProcessEnv): Promise<string[]> {
  const store = resolveMemoryStore(env);
  const raw = await store.read(FILE);
  if (raw === null) return [];
  try {
    const parsed = Schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.alwaysAllow : [];
  } catch {
    return [];
  }
}

/** Add a tool to the always-allow list (idempotent). */
export async function addAlwaysAllow(tool: string, env?: NodeJS.ProcessEnv): Promise<void> {
  const current = await loadAlwaysAllow(env);
  if (current.includes(tool)) return;
  const store = resolveMemoryStore(env);
  await store.write(FILE, JSON.stringify({ alwaysAllow: [...current, tool] }, null, 2));
}
