import { listRooms, resolveRoom, projectsBaseDir } from "./rooms.js";
import { installModes, OPERATOR_MODES } from "../modes/builtin.js";
import { recordRun, shouldProposeSkill } from "../modes/learning.js";
import { listSkills } from "../skills/store.js";
import type { Room } from "./rooms.js";

/** `argo rooms` — print every project room as "<name>  <path>". */
export async function runRoomsList(env: NodeJS.ProcessEnv): Promise<void> {
  const rooms = await listRooms(env);
  if (rooms.length === 0) {
    console.log(`(no projects found under ${projectsBaseDir(env)})`);
    return;
  }
  for (const room of rooms) console.log(`${room.name}  ${room.path}`);
}

/**
 * Resolve a room by name for the rooted run in cli.ts. Returns the Room, or
 * prints an actionable error and returns null so the caller can exit.
 */
export async function resolveRoomOrExit(
  name: string,
  env: NodeJS.ProcessEnv,
): Promise<Room | null> {
  const room = await resolveRoom(name, env);
  if (!room) {
    console.log(
      `No project named "${name}" under ${projectsBaseDir(env)}. ` +
        "Run `argo rooms` to list available projects.",
    );
    return null;
  }
  return room;
}

/** Names of the built-in operator modes, for cross-referencing the store. */
const MODE_NAMES = new Set(OPERATOR_MODES.map((mode) => mode.name));

/**
 * `argo modes` / `argo modes list` lists which operator modes are installed in
 * the skill store; `argo modes install` installs them all. Other subcommands
 * print usage guidance. "Installed" is read from the store, not the catalog, so
 * the list reflects reality.
 */
export async function runModes(
  env: NodeJS.ProcessEnv,
  sub?: string,
): Promise<void> {
  if (sub === "install") {
    const names = await installModes({ env });
    console.log(`installed ${names.length} operator mode(s):`);
    for (const name of names) console.log(`  ${name}`);
    return;
  }

  if (sub && sub !== "list") {
    console.log('Usage: argo modes [list|install]');
    return;
  }

  const installed = new Set(
    (await listSkills(env))
      .map((skill) => skill.meta.name)
      .filter((name) => MODE_NAMES.has(name)),
  );
  for (const mode of OPERATOR_MODES) {
    const mark = installed.has(mode.name) ? "[installed]" : "[not installed]";
    console.log(`${mark} ${mode.name} — ${mode.description}`);
  }
  if (installed.size === 0) {
    console.log("\nRun `argo modes install` to install them.");
  }
}

/**
 * After a successful run, record the instruction and surface a one-line skill
 * suggestion if its pattern has recurred enough. Best-effort: a failure here
 * must never fail the command, so everything is wrapped and swallowed.
 */
export async function suggestSkillFromRun(
  instruction: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  try {
    await recordRun(instruction, { env });
    const proposal = await shouldProposeSkill(instruction, { env });
    if (proposal) console.log(`\n${proposal}`);
  } catch {
    // learning is advisory — never let it break the command it follows
  }
}
