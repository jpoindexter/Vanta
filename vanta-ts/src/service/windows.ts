import { SERVICE_MARKER } from "./systemd.js";

export type TaskXmlOptions = { runnerPath: string; workingDir: string; userId: string };
export type TaskRunnerOptions = { command: string; args: string[]; logPath: string };

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function psQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function buildTaskRunner(opts: TaskRunnerOptions): string {
  return [
    `# ${SERVICE_MARKER}`,
    `$env:VANTA_SERVICE_LOG = ${psQuote(opts.logPath)}`,
    `[System.IO.File]::AppendAllText(${psQuote(opts.logPath)}, 'VANTA_SERVICE_STARTED' + [Environment]::NewLine)`,
    `& ${psQuote(opts.command)} ${opts.args.map(psQuote).join(" ")} *>> ${psQuote(opts.logPath)}`,
    "exit $LASTEXITCODE",
    "",
  ].join("\r\n");
}

export function buildTaskXml(opts: TaskXmlOptions): string {
  return [
    '<?xml version="1.0" encoding="UTF-16"?>',
    '<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">',
    "  <RegistrationInfo>",
    `    <Description>${SERVICE_MARKER}</Description>`,
    "  </RegistrationInfo>",
    "  <Triggers><LogonTrigger><Enabled>true</Enabled></LogonTrigger></Triggers>",
    `  <Principals><Principal id="Author"><UserId>${xml(opts.userId)}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>`,
    "  <Settings>",
    "    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>",
    "    <RestartOnFailure><Interval>PT1M</Interval><Count>5</Count></RestartOnFailure>",
    "    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit><Enabled>true</Enabled>",
    "  </Settings>",
    "  <Actions Context=\"Author\"><Exec>",
    "    <Command>powershell.exe</Command>",
    `    <Arguments>-NoProfile -NonInteractive -ExecutionPolicy Bypass -File &quot;${xml(opts.runnerPath)}&quot;</Arguments>`,
    `    <WorkingDirectory>${xml(opts.workingDir)}</WorkingDirectory>`,
    "  </Exec></Actions>",
    "</Task>",
    "",
  ].join("\n");
}
