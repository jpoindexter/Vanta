import { z } from "zod";
import type { Tool } from "./types.js";
import { parseDeepLink, resolveLaunchCommand, type LaunchCommand } from "../deeplink/parse.js";

const Args = z.object({
  url: z.string().min(1, "url must be non-empty"),
});

/** Best-effort macOS spawn of a new Vanta session terminal for a fully-validated
 *  link. Never throws — the resolved descriptor is the real deliverable, opening a
 *  window is a convenience. Returns whether a launch was attempted. */
async function tryOpenTerminal(launch: LaunchCommand): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  if (process.env.VANTA_DEEPLINK_NO_OPEN === "1") return false;
  try {
    const { spawn } = await import("node:child_process");
    // `open -a Terminal <dir>` opens a terminal at the working dir if we have one;
    // params reach `open` as separate argv elements (never a shell string).
    const args = launch.cwd ? ["-a", "Terminal", launch.cwd] : ["-a", "Terminal"];
    const child = spawn("open", args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function formatDescriptor(launch: LaunchCommand, opened: boolean): string {
  const lines = [
    `cmd: ${launch.cmd}`,
    `args: ${JSON.stringify(launch.args)}`,
    `cwd: ${launch.cwd ?? "(none — current dir)"}`,
    `launched_terminal: ${opened ? "yes" : "no (descriptor only)"}`,
  ];
  return lines.join("\n");
}

const scheme = (url: unknown): string => {
  const s = typeof url === "string" ? url : "";
  const i = s.indexOf(":");
  return i > 0 ? s.slice(0, i + 1) : "(none)";
};

export const openDeepLinkTool: Tool = {
  schema: {
    name: "open_deep_link",
    description:
      "Parse and resolve a vanta:// deep link into a safe launch descriptor for a " +
      "pre-filled Vanta session. Accepts vanta://run?prompt=...&cwd=...&repo=... — " +
      "URL-decodes the params, rejects control characters and non-path cwd/repo, and " +
      "returns the resolved argv (never a shell string). On macOS it may also open a " +
      "terminal for a fully-validated link; the descriptor is the deliverable.",
    parameters: {
      type: "object",
      required: ["url"],
      properties: {
        url: {
          type: "string",
          description: "The vanta:// deep link, e.g. vanta://run?prompt=fix%20auth&cwd=/repo.",
        },
      },
    },
  },
  // Only the scheme reaches the kernel — never the (untrusted) prompt/path payload.
  describeForSafety: (args) => `open deep link ${scheme(args.url)}`,
  async execute(raw, _ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: `Invalid args: ${parsed.error.message}` };
    }
    const link = parseDeepLink(parsed.data.url);
    if (!link.ok) {
      return { ok: false, output: `Rejected deep link: ${link.error}` };
    }
    const launch = resolveLaunchCommand(link.value);
    const opened = await tryOpenTerminal(launch);
    return { ok: true, output: formatDescriptor(launch, opened) };
  },
};
