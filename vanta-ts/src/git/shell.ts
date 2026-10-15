/** Parse a direct Git command without evaluating a shell or repository aliases. */
export function directGitArgs(command: string): string[] | null {
  if (!/^\s*(?:[^\s]+\/)?git(?:\s|$)/.test(command)) {
    if (/[;&|]\s*(?:[^\s]+\/)?git(?:\s|$)/.test(command)) throw new Error("Use a direct Git tool invocation for compound Git shell commands");
    return null;
  }
  const tokens = tokenize(command);
  if (!/^(?:.*\/)?git$/.test(tokens.shift() ?? "")) throw new Error("Use a direct Git tool invocation for Git shell commands");
  return tokens;
}

type Tokens = { token: string; quote: string; escaped: boolean; values: string[] };
function flush(state: Tokens): void {
  if (state.token) state.values.push(state.token);
  state.token = "";
}

function append(state: Tokens, char: string): void {
  if (state.escaped) { state.token += char; state.escaped = false; return; }
  if (state.quote) {
    if (char === state.quote) state.quote = "";
    else state.token += char;
    return;
  }
  if (char === "'" || char === '"') { state.quote = char; return; }
  if (/[$`;&|<>\n(){}]/.test(char)) throw new Error("Use Git tools for compound Git commands; repository execution settings cannot be inherited by a shell");
  if (char === "\\") { state.escaped = true; return; }
  if (/\s/.test(char)) { flush(state); return; }
  state.token += char;
}

function tokenize(command: string): string[] {
  const state: Tokens = { token: "", quote: "", escaped: false, values: [] };
  for (const char of command) append(state, char);
  if (state.quote || state.escaped) throw new Error("Unterminated Git argument quote/escape");
  flush(state);
  return state.values;
}

export function gitShellRefusal(command: string, options: { background?: boolean; ssh?: string }): string | null {
  try {
    if (directGitArgs(command) && (options.background || options.ssh)) {
      return "Use foreground local Git tools; remote/background Git needs a separately governed execution boundary";
    }
    return null;
  } catch (error) { return (error as Error).message; }
}
