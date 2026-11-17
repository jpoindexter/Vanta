import { delimiter, join } from "node:path";
import { homedir } from "node:os";

/**
 * macOS GUI apps inherit a minimal launchd PATH instead of the operator's shell
 * PATH. Add the standard user and package-manager executable locations so the
 * packaged runtime can launch configured stdio MCP servers.
 */
export function desktopRuntimeEnv(
  parent = process.env,
  options = { platform: process.platform, home: homedir() },
) {
  const env = { ...parent };
  if (options.platform !== "darwin") return env;
  const current = (parent.PATH ?? "").split(delimiter).filter(Boolean);
  const executableDirs = [
    join(options.home, ".local", "bin"),
    join(options.home, ".npm-global", "bin"),
    join(options.home, ".bun", "bin"),
    join(options.home, ".volta", "bin"),
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    ...current,
  ];
  env.PATH = [...new Set(executableDirs)].join(delimiter);
  return env;
}
