import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { resolveVantaHome } from "../store/home.js";

export type UserCommand = {
  name: string;
  description: string;
  /** Full body of the command file — used as the agent instruction template. */
  content: string;
};

/**
 * Discover user-defined slash commands from ~/.vanta/commands/<name>.md.
 * The first heading in the file (if any) becomes the description. The file
 * body is the instruction template sent to the agent when the command fires.
 * Returns [] when the directory doesn't exist (no-op on unconfigured installs).
 */
export async function loadUserCommands(env?: NodeJS.ProcessEnv): Promise<UserCommand[]> {
  const dir = join(resolveVantaHome(env), "commands");
  let files: string[] = [];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  const commands: UserCommand[] = [];
  for (const file of files) {
    const name = basename(file, ".md");
    const raw = await readFile(join(dir, file), "utf8").catch(() => null);
    if (!raw) continue;
    const lines = raw.split("\n");
    const firstLine = lines[0] ?? "";
    const description = firstLine.startsWith("#")
      ? firstLine.replace(/^#+\s*/, "").trim()
      : `Custom command: ${name}`;
    commands.push({ name, description, content: raw.trim() });
  }
  return commands;
}
