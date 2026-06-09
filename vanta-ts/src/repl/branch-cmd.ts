import type { SlashHandler } from "./types.js";

export const branch: SlashHandler = (arg) => {
  const name = arg.trim();

  if (!name) {
    return {
      output:
        "  /branch <name> creates or switches to a git branch.\n" +
        "  Requires approval (scope: project root only).\n" +
        "  Example: /branch feature/new-feature",
    };
  }

  if (!/^[a-z0-9._\/-]+$/i.test(name)) {
    return {
      output:
        "  Invalid branch name. Use alphanumeric, dash, dot, underscore, and forward slash.",
    };
  }

  return {
    resend: `create or switch git branch: git_branch "${name}" && git_checkout "${name}"`,
  };
};
