import type { SlashHandler } from "./types.js";

const STYLES = {
  concise: "Reply in 1-2 sentences, omit examples and explanations unless critical.",
  normal: "Reply at normal length with context and examples as needed.",
  verbose:
    "Reply with full context, examples, reasoning, and related considerations.",
};

export const outputStyle: SlashHandler = (arg, ctx) => {
  const style = arg.trim().toLowerCase() as keyof typeof STYLES;

  if (!style) {
    const list = Object.keys(STYLES)
      .map((s) => `  ${s}`)
      .join("\n");
    return { output: `Available output styles:\n${list}\n\nUse: /output-style <style>` };
  }

  if (!(style in STYLES)) {
    return {
      output: `  unknown style '${style}' — use /output-style to see available options`,
    };
  }

  // Note: style preference would be persisted to state/config in full implementation
  return {
    output: `  output style set to '${style}'\n\n  ${STYLES[style]}`,
  };
};
