import type { SlashHandler } from "./types.js";

function appendTaskRouting(rows: string[], cheap: string | undefined, expensive: string | undefined): void {
  if (!cheap && !expensive) return;
  rows.push("", "  Task routing:");
  if (cheap) rows.push(`    cheap     → ${cheap}`);
  if (expensive) rows.push(`    expensive → ${expensive}`);
}

function appendNamedRoutes(rows: string[], env: NodeJS.ProcessEnv): void {
  const routeKeys = Object.keys(env).filter((k) => k.startsWith("VANTA_ROUTE_"));
  if (!routeKeys.length) return;
  rows.push("", "  Named routes:");
  for (const key of routeKeys.sort()) {
    const task = key.replace("VANTA_ROUTE_", "").toLowerCase();
    rows.push(`    ${task.padEnd(12)} → ${env[key]}`);
  }
}

function appendHints(rows: string[], env: NodeJS.ProcessEnv, cheap: string | undefined, expensive: string | undefined): void {
  const routeKeys = Object.keys(env).filter((k) => k.startsWith("VANTA_ROUTE_"));
  if ((env.VANTA_PROVIDER === "nvidia" || env.VANTA_PROVIDER === "nim") && !env.NVIDIA_API_KEY) {
    rows.push("", "  ⚠ NVIDIA_API_KEY is not set. Get a key at https://build.nvidia.com/settings/api-keys");
  }
  if (!cheap && !expensive && !routeKeys.length) {
    rows.push("", "  No routing configured. Set VANTA_ROUTE_SUMMARIZE=nvidia:meta/llama-3.1-8b-instruct");
    rows.push("  to route summarize tasks to NVIDIA NIM (requires NVIDIA_API_KEY).");
  }
}

/** /routes — show the configured model-routing setup. */
export const routes: SlashHandler = (_arg, ctx) => {
  const env = ctx.env;
  const provider = env.VANTA_PROVIDER ?? "openai (default)";
  const model = env.VANTA_MODEL ?? "(provider default)";
  const cheap = env.VANTA_MODEL_CHEAP;
  const expensive = env.VANTA_MODEL_EXPENSIVE;

  const rows: string[] = [
    `  Provider:   ${provider}`,
    `  Model:      ${model}`,
  ];

  appendTaskRouting(rows, cheap, expensive);
  appendNamedRoutes(rows, env);
  appendHints(rows, env, cheap, expensive);

  return { output: rows.join("\n") };
};
