import { execFileSync } from "node:child_process";

/** Packaged smoke check: the renderer root is served and the kernel (or first-run setup) answers. */
export function checkPackagedKernel(url, boundaryToken) {
  const boundaryHeader = ["--header", `x-vanta-desktop-boundary: ${boundaryToken}`];
  const root = execFileSync("/usr/bin/curl", ["--fail", "--silent", "--max-time", "60", ...boundaryHeader, url], { encoding: "utf8" });
  if (!root.includes('id="root"')) throw new Error("Packaged renderer asset did not contain the Vanta root.");
  try {
    const status = JSON.parse(execFileSync("/usr/bin/curl", ["--fail", "--silent", "--max-time", "60", ...boundaryHeader, `${url}/api/status`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
    if (status.kernel !== "online") throw new Error(`Packaged kernel reported ${status.kernel ?? "unknown"}.`);
  } catch {
    const setup = JSON.parse(execFileSync("/usr/bin/curl", ["--fail", "--silent", "--max-time", "10", ...boundaryHeader, `${url}/api/setup`], { encoding: "utf8" }));
    if (!Array.isArray(setup) || setup.length === 0) throw new Error("Packaged first-run setup is unavailable.");
    console.log("desktop smoke: first-run model setup ready");
  }
}
