import { join } from "node:path";
import { readFile, writeFile, rm } from "node:fs/promises";
import { resolveVantaHome } from "../store/home.js";

function moimPath(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "moim.md");
}

/** Return the pinned top-of-mind note, or undefined if none is set. */
export async function readMoim(env: NodeJS.ProcessEnv): Promise<string | undefined> {
  const text = await readFile(moimPath(env), "utf8").catch(() => "");
  const trimmed = text.trim();
  return trimmed.length ? trimmed : undefined;
}

/** Pin a top-of-mind note (replaces any existing note). */
export async function writeMoim(text: string, env: NodeJS.ProcessEnv): Promise<void> {
  await writeFile(moimPath(env), text.trim() + "\n", "utf8");
}

/** Clear the pinned note. */
export async function clearMoim(env: NodeJS.ProcessEnv): Promise<void> {
  await rm(moimPath(env), { force: true });
}
