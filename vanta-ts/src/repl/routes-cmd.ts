import type { SlashHandler } from "./types.js";

/** /routes — show the configured model-routing setup. */
export const routes: SlashHandler = (_arg, ctx) => {
  const env = ctx.env;
  const provider = env.VANTA_PROVIDER ?? "openai (default)";
  const model = env.VANTA_MODEL ?? "(provider default)";

  const rows: string[] = [
    `  Provider:   ${provider}`,
    `  Model:      ${model}`,
  ];

  // Cheap/expensive routing (task-router).
  const cheap = env.VANTA_MODEL_CHEAP;
  const expensive = env.VANTA_MODEL_EXPENSIVE;
  if (cheap || expensive) {
    rows.push("");
    rows.push("  Task routing:");
    if (cheap)    rows.push(`    cheap     → ${cheap}`);
    if (expensive) rows.push(`    expensive → ${expensive}`);
  }

  // Named-route overrides (VANTA_ROUTE_<TASK>=provider:model).
  const routeKeys = Object.keys(env).filter((k) => k.startsWith("VANTA_ROUTE_"));
  if (routeKeys.length) {
    rows.push("");
    rows.push("  Named routes:");
    for (const key of routeKeys.sort()) {
      const task = key.replace("VANTA_ROUTE_", "").toLowerCase();
      rows.push(`    ${task.padEnd(12)} → ${env[key]}`);
    }
  }

  // NVIDIA NIM hint when nvidia/nim is in use.
  if ((env.VANTA_PROVIDER === "nvidia" || env.VANTA_PROVIDER === "nim") && !env.NVIDIA_API_KEY) {
    rows.push("");
    rows.push("  ⚠ NVIDIA_API_KEY is not set. Get a key at https://build.nvidia.com/settings/api-keys");
  }

  if (!cheap && !expensive && !routeKeys.length) {
    rows.push("");
    rows.push("  No routing configured. Set VANTA_ROUTE_SUMMARIZE=nvidia:meta/llama-3.1-8b-instruct");
    rows.push("  to route summarize tasks to NVIDIA NIM (requires NVIDIA_API_KEY).");
  }

  return { output: rows.join("\n") };
};
