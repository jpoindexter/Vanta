import { consoleCallbacks } from "../session.js";
import type { createConversation } from "../agent.js";
import type { OutputFormat } from "./commands.js";

export function buildCallbacks(format: OutputFormat): Partial<Parameters<typeof createConversation>[1]> {
  if (format === "stream-json") return { onTextDelta: (d: string) => process.stdout.write(JSON.stringify({ type: "delta", text: d }) + "\n") };
  if (format === "json") return {};
  return consoleCallbacks();
}
