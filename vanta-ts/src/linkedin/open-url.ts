import { spawn } from "node:child_process";

type SpawnLike = typeof spawn;

function commandForPlatform(platform: NodeJS.Platform, url: string): [string, string[]] {
  if (platform === "darwin") return ["open", [url]];
  if (platform === "win32") return ["rundll32.exe", ["url.dll,FileProtocolHandler", url]];
  return ["xdg-open", [url]];
}

export function openExternalUrl(
  url: string,
  platform: NodeJS.Platform = process.platform,
  spawnProcess: SpawnLike = spawn,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const [command, args] = commandForPlatform(platform, url);
    const child = spawnProcess(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
