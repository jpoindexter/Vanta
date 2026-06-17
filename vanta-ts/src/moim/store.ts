import { resolveMemoryStore } from "../store/memory-store.js";

const MOIM_PATH = "moim.md";

/** Return the pinned top-of-mind note, or undefined if none is set. */
export async function readMoim(env: NodeJS.ProcessEnv): Promise<string | undefined> {
  const store = resolveMemoryStore(env);
  const trimmed = ((await store.read(MOIM_PATH)) ?? "").trim();
  return trimmed.length ? trimmed : undefined;
}

/** Pin a top-of-mind note (replaces any existing note). */
export async function writeMoim(text: string, env: NodeJS.ProcessEnv): Promise<void> {
  const store = resolveMemoryStore(env);
  await store.write(MOIM_PATH, text.trim() + "\n");
}

/** Clear the pinned note. */
export async function clearMoim(env: NodeJS.ProcessEnv): Promise<void> {
  // MemoryStore has no delete; an empty note reads back as "no note" (readMoim
  // trims → undefined), preserving the observable clear behavior.
  const store = resolveMemoryStore(env);
  await store.write(MOIM_PATH, "");
}
