import { describe, expect, it } from "vitest";
import { groupProjectFiles, mentionedProjectFiles } from "./file-context.js";

describe("desktop project file grouping", () => {
  const context = {
    files: ["README.md", "src/App.tsx", "src/chat.tsx", "docs/guide.md"],
    changed: ["src/App.tsx"],
    recent: ["src/chat.tsx", "README.md", "src/App.tsx"],
  };

  it("uses task mentions and keeps groups distinct", () => {
    const mentioned = mentionedProjectFiles(context.files, ["review @src/chat.tsx with src/App.tsx"]);
    expect(groupProjectFiles(context, mentioned, "")).toEqual({
      changed: ["src/App.tsx"],
      mentioned: ["src/chat.tsx"],
      recent: ["README.md"],
      search: [],
    });
  });

  it("searches the complete safe project index", () => {
    expect(groupProjectFiles(context, [], "DOC").search).toEqual(["docs/guide.md"]);
  });
});
