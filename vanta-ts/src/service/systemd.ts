export const SERVICE_MARKER = "VANTA-MANAGED: studio.theft.vanta.gateway";

export type SystemdUnitOptions = {
  command: string;
  args: string[];
  workingDir: string;
  logPath: string;
};

function quote(value: string): string {
  return `"${value.replaceAll("%", "%%").replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function buildSystemdUnit(opts: SystemdUnitOptions): string {
  return [
    `# ${SERVICE_MARKER}`,
    "[Unit]",
    "Description=Vanta gateway",
    "After=network-online.target",
    "StartLimitIntervalSec=300",
    "StartLimitBurst=5",
    "",
    "[Service]",
    "Type=simple",
    `WorkingDirectory=${quote(opts.workingDir)}`,
    `ExecStart=${[opts.command, ...opts.args].map(quote).join(" ")}`,
    "Restart=on-failure",
    "RestartSec=5",
    `StandardOutput=append:${opts.logPath}`,
    `StandardError=append:${opts.logPath}`,
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}
