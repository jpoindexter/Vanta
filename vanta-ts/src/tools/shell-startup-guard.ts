import { basename } from "node:path";

// SHELL-STARTUP-WRITE-PROMPT: a shell startup file is a persistence /
// code-execution vector — anything written there runs on every new shell.
// Writing one is gated by an EXTRA explicit confirmation even inside an
// otherwise-writable zone. Pure detection by case-sensitive BASENAME so it
// fires regardless of directory (a user's `~/.zshrc`, a repo's `config.fish`,
// or `/etc/profile` all match).

/** Known shell startup file basenames. Case-sensitive; dotfiles included. */
const SHELL_STARTUP_BASENAMES = new Set<string>([
  ".zshenv",
  ".zshrc",
  ".zprofile",
  ".zlogin",
  ".zlogout",
  ".bash_profile",
  ".bash_login",
  ".bashrc",
  ".bash_logout",
  ".profile",
  ".login",
  ".cshrc",
  ".tcshrc",
  "config.fish", // fish (lives at ~/.config/fish/config.fish or anywhere)
  "profile", // /etc/profile, /etc/zsh/zprofile-style bare name
  "zshenv", // /etc/zshenv
  "zshrc", // /etc/zshrc
  "zprofile", // /etc/zprofile
  "bashrc", // /etc/bashrc
]);

/**
 * True when `path`'s basename is a known shell startup file. Pure: matches the
 * case-sensitive basename in ANY directory, so it catches both dotfile forms
 * (`~/.zshrc`) and the bare system forms (`/etc/profile`, `/etc/zshenv`) plus
 * fish's `config.fish`. A normal `.ts`/`.md`/`.gitignore`/`README.md` is NOT a
 * startup file and returns false.
 */
export function isShellStartupFile(path: string): boolean {
  return SHELL_STARTUP_BASENAMES.has(basename(path));
}

/**
 * The confirmation message shown before writing a shell startup file. Names the
 * persistence/code-execution risk so the human knows why this write is special.
 */
export function shellStartupWarning(path: string): string {
  return (
    `Write shell startup file ${path} — this is a persistence/code-execution ` +
    `vector: anything here runs on every new shell. Confirm only if you intend it.`
  );
}
