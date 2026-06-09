import type { SlashHandler } from "./types.js";

/** Extract file paths from conversation messages (read_file, write_file tool calls, etc.) */
function extractFilesFromConversation(messages: any[]): string[] {
  const files = new Set<string>();

  for (const msg of messages) {
    if (msg.content) {
      // Handle array content with tool calls
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "tool_use") {
            const input = block.input as Record<string, any>;
            if (input?.path) files.add(input.path);
            if (input?.file_path) files.add(input.file_path);
            if (input?.target) files.add(input.target);
            if (input?.new_path) files.add(input.new_path);
          }
        }
      }
    }
  }

  return Array.from(files).sort();
}

export const files: SlashHandler = (_arg, ctx) => {
  const contextFiles = extractFilesFromConversation(ctx.convo.messages);

  if (!contextFiles.length) {
    return { output: "  (no files in the current context — start with /image, @file, or a read_file call)" };
  }

  const list = contextFiles.map((f) => `  ${f}`).join("\n");
  return { output: `Files in context:\n${list}` };
};
