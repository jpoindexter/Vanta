import { addRule } from "./store.js";

export async function grantAlways(toolName: string | undefined, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (!toolName) return;
  await addRule({ action: "allow", tool: toolName }, env);
}

export async function grantNever(toolName: string | undefined, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (!toolName) return;
  await addRule({ action: "deny", tool: toolName }, env);
}
