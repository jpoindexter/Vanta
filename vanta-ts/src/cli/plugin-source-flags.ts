// VANTA-PLUGIN-URL: parse `--plugin-url <url>` and `--plugin-dir <path>` startup
// flags (both also accept the `--flag=value` form). Mirrors permission-mode.ts.
// The flags only carry the source; install + the enable/trust gate live elsewhere.

export type PluginSource = { url?: string; dir?: string };

export type PluginSourceParse = {
  rest: string[];
  sources: PluginSource[];
  error?: string;
};

const FLAG_KEY: Record<string, keyof PluginSource> = {
  "--plugin-url": "url",
  "--plugin-dir": "dir",
};

function matchFlag(arg: string): { key: keyof PluginSource; inlineValue?: string } | undefined {
  for (const [flag, key] of Object.entries(FLAG_KEY)) {
    if (arg === flag) return { key };
    if (arg.startsWith(`${flag}=`)) return { key, inlineValue: arg.slice(flag.length + 1) };
  }
  return undefined;
}

/** Extract every `--plugin-url`/`--plugin-dir` flag; the rest passes through. */
export function parsePluginSourceFlags(args: string[]): PluginSourceParse {
  const rest: string[] = [];
  const sources: PluginSource[] = [];
  let error: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    const match = matchFlag(arg);
    if (!match) {
      rest.push(arg);
      continue;
    }
    const value = match.inlineValue ?? args[++i];
    if (!value) {
      error = `${arg} requires a value`;
      continue;
    }
    sources.push({ [match.key]: value });
  }
  return { rest, sources, error };
}
