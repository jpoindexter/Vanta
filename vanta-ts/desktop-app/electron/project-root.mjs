import { readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import net from "node:net";

export function projectArg(args) {
  const index = args.indexOf("--project");
  return index >= 0 ? args[index + 1] : undefined;
}

export async function usableDirectory(path) {
  if (!path) return false;
  return stat(path).then((value) => value.isDirectory()).catch(() => false);
}

export async function readProjectSetting(userData) {
  try {
    const parsed = JSON.parse(await readFile(join(userData, "desktop-settings.json"), "utf8"));
    return typeof parsed.projectRoot === "string" ? parsed.projectRoot : undefined;
  } catch { return undefined; }
}

export async function saveProjectSetting(userData, projectRoot) {
  await writeFile(join(userData, "desktop-settings.json"), JSON.stringify({ projectRoot }, null, 2) + "\n", { mode: 0o600 });
}

export async function resolveProjectRoot({ args, env, userData, cwd = process.cwd(), home = homedir() }) {
  const candidates = [projectArg(args), env.VANTA_PROJECT_ROOT, await readProjectSetting(userData), cwd, home];
  for (const candidate of candidates) if (await usableDirectory(candidate)) return resolve(candidate);
  return resolve(home);
}

export async function findAvailablePort(preferred, host = "127.0.0.1") {
  for (let port = preferred; port < preferred + 20; port++) if (await canListen(port, host)) return port;
  throw new Error(`No free Vanta desktop port in ${preferred}-${preferred + 19}.`);
}

function canListen(port, host) {
  return new Promise((resolvePort) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolvePort(false));
    server.listen(port, host, () => server.close(() => resolvePort(true)));
  });
}
