// CLI-DX-PACK — `vanta completion [bash|zsh|fish]`: emit a shell completion
// script for the top-level commands. Single source of truth for the command
// list lives here (CLI_COMMANDS); the script is static text (pure to build).

export const CLI_COMMANDS = [
  "setup", "status", "doctor", "run", "chat", "sessions", "resume", "skills", "skill",
  "schedule", "cron", "gateway", "service", "rooms", "room", "modes", "auth", "mcp",
  "roadmap", "desktop", "browser", "memory", "hooks", "voice", "improve", "factory",
  "lint", "open", "prompt-size", "completion", "backup", "import", "help",
] as const;

export type Shell = "bash" | "zsh" | "fish";

/** Build a completion script for the given shell. Pure. */
export function completionScript(shell: Shell, commands: readonly string[] = CLI_COMMANDS): string {
  const list = commands.join(" ");
  if (shell === "fish") {
    return commands.map((c) => `complete -c vanta -n __fish_use_subcommand -a ${c}`).join("\n") + "\n";
  }
  if (shell === "zsh") {
    return [
      "#compdef vanta",
      "_vanta() {",
      `  local cmds=(${list})`,
      "  _arguments '1:command:($cmds)' '*::arg:->args'",
      "}",
      "_vanta \"$@\"",
      "",
    ].join("\n");
  }
  // bash (default)
  return [
    "_vanta_completion() {",
    "  local cur=\"${COMP_WORDS[COMP_CWORD]}\"",
    `  local cmds="${list}"`,
    "  if [ \"$COMP_CWORD\" -eq 1 ]; then",
    "    COMPREPLY=( $(compgen -W \"$cmds\" -- \"$cur\") )",
    "  fi",
    "}",
    "complete -F _vanta_completion vanta",
    "",
  ].join("\n");
}

/** Resolve the requested shell from argv (default bash). */
export function resolveShell(arg: string | undefined): Shell {
  const s = (arg ?? "").toLowerCase();
  return s === "zsh" || s === "fish" ? s : "bash";
}

export function runCompletion(argv: string[]): number {
  console.log(completionScript(resolveShell(argv[0])));
  return 0;
}
