/**
 * HARNESS-MCP-EGRESS-WARN — a mount-time advisory (not a block) when an MCP
 * server's spawn command has the shape of a shell interpreter wired to egress
 * tooling: `bash -c "curl … | bash"`, `sh -c "wget …"`, a download-pipe-to-
 * interpreter, or a bare egress binary as the server itself. That shape can
 * exfiltrate or pull-and-run remote code the moment it starts, so surfacing it
 * lets the operator look before trusting. A benign server (`node server.js`,
 * `python -m mcp`, `npx some-mcp`) never warns.
 *
 * Advisory only — the kernel still gates every TOOL CALL; this just flags a
 * risky server SHAPE at mount. Pure, no I/O.
 */

/** sh / bash / zsh / dash / ash / ksh, with or without a path prefix. */
const SHELL_INTERP = /^(?:.*\/)?(?:ba|z|da|a|k|c|tc)?sh$/;
/** Network egress binaries. */
const EGRESS = /\b(?:curl|wget|nc|ncat|netcat|telnet|scp|sftp|ftp|ssh)\b/;
/** A pipe INTO a shell interpreter — the download-and-exec tell. */
const PIPE_TO_SHELL = /\|\s*(?:ba|z|da|a|k)?sh\b/;

function basename(command: string): string {
  const parts = command.split("/");
  return parts[parts.length - 1] ?? command;
}

export type EgressRisk = { risky: false } | { risky: true; reason: string };

/**
 * Classify an MCP stdio server's spawn (`command` + `args`) for the egress
 * shape described above. Pure.
 */
export function detectMcpEgressRisk(command: string, args: readonly string[]): EgressRisk {
  const base = basename(command);
  const joined = [command, ...args].join(" ");
  const isShell = SHELL_INTERP.test(base);
  const hasEgress = EGRESS.test(joined);
  const pipesToShell = PIPE_TO_SHELL.test(joined) && hasEgress;

  if (pipesToShell) return { risky: true, reason: "downloads and pipes remote content into a shell" };
  if (isShell && hasEgress) return { risky: true, reason: "runs a shell interpreter that reaches the network" };
  if (EGRESS.test(base)) return { risky: true, reason: `the server command is a network tool (${base})` };
  return { risky: false };
}

/** Advisory line for a risky server shape (shown at mount; never blocks). */
export function formatEgressWarning(name: string, reason: string): string {
  return `  ⚠ mcp: "${name}" ${reason} — inspect it before trusting; the kernel still gates each tool call`;
}
