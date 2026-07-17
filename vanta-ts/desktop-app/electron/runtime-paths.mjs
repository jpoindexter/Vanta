import { join } from "node:path";

/** Keep source development and packaged runtime ownership independent. */
export function resolveRuntimePaths({ appPath, packaged, resourcesPath, platform }) {
  const loaderRoot = packaged ? join(resourcesPath, "app.asar.unpacked") : appPath;
  return {
    cli: join(appPath, "src", "cli.ts"),
    loader: join(loaderRoot, "node_modules", "tsx", "dist", "loader.mjs"),
    dist: join(appPath, "desktop-app", "dist"),
    icon: join(appPath, "desktop-app", "build", "icon.png"),
    kernel: packaged
      ? join(resourcesPath, "kernel", platform === "win32" ? "vanta-kernel.exe" : "vanta-kernel")
      : join(appPath, "..", "target", "debug", platform === "win32" ? "vanta-kernel.exe" : "vanta-kernel"),
  };
}
