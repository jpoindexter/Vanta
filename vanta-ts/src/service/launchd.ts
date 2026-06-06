// Pure launchd plist generation for the macOS Vanta gateway service. Kept
// separate from the launchctl side effects (manager.ts) so it's unit-testable.

export type PlistOptions = {
  label: string;
  programArgs: string[];
  workingDir: string;
  logPath: string;
  /** Extra PATH entries — launchd gives a minimal PATH, so node/cargo must be findable. */
  pathDirs?: string[];
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const stringTag = (s: string): string => `<string>${escapeXml(s)}</string>`;

/** Build a launchd plist that runs the gateway at load and keeps it alive. */
export function buildLaunchdPlist(opts: PlistOptions): string {
  const args = opts.programArgs.map((a) => `      ${stringTag(a)}`).join("\n");
  const pathBlock =
    opts.pathDirs && opts.pathDirs.length > 0
      ? [
          "    <key>EnvironmentVariables</key>",
          "    <dict>",
          "      <key>PATH</key>",
          `      ${stringTag(opts.pathDirs.join(":"))}`,
          "    </dict>",
        ].join("\n")
      : "";

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "  <dict>",
    "    <key>Label</key>",
    `    ${stringTag(opts.label)}`,
    "    <key>ProgramArguments</key>",
    "    <array>",
    args,
    "    </array>",
    "    <key>WorkingDirectory</key>",
    `    ${stringTag(opts.workingDir)}`,
    "    <key>RunAtLoad</key>",
    "    <true/>",
    "    <key>KeepAlive</key>",
    "    <true/>",
    "    <key>StandardOutPath</key>",
    `    ${stringTag(opts.logPath)}`,
    "    <key>StandardErrorPath</key>",
    `    ${stringTag(opts.logPath)}`,
    ...(pathBlock ? [pathBlock] : []),
    "  </dict>",
    "</plist>",
    "",
  ].join("\n");
}
