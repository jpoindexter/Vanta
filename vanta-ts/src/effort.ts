import { EFFORT_LEVELS, type EffortLevel } from "./types.js";

export const DEFAULT_EFFORT_LEVEL: EffortLevel = "medium";

export function isEffortLevel(value: string): value is EffortLevel {
  return (EFFORT_LEVELS as readonly string[]).includes(value);
}

export function resolveEffortLevel(value: unknown): EffortLevel {
  return typeof value === "string" && isEffortLevel(value) ? value : DEFAULT_EFFORT_LEVEL;
}

export function parseEffortFlag(
  args: string[],
  env: NodeJS.ProcessEnv,
): { rest: string[]; env: NodeJS.ProcessEnv; error?: string } {
  const rest: string[] = [];
  const nextEnv = { ...env };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg !== "--effort") {
      rest.push(arg);
      continue;
    }
    const value = args[i + 1];
    if (!value || !isEffortLevel(value)) {
      return { rest: args, env, error: "--effort must be one of: low, medium, high, max" };
    }
    nextEnv.VANTA_EFFORT_LEVEL = value;
    i++;
  }
  return { rest, env: nextEnv };
}
