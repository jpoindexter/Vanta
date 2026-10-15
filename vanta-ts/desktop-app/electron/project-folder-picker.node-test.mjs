import assert from "node:assert/strict";
import test from "node:test";
import { showProjectFolderPicker } from "./project-folder-picker.mjs";

test("opens a native directory-only picker at the current project", async () => {
  let received;
  const selected = await showProjectFolderPicker({
    currentPath: "/projects/current",
    fallbackPath: "/projects/fallback",
    parentWindow: { id: "main" },
    dialog: {
      async showOpenDialog(parentWindow, options) {
        received = { parentWindow, options };
        return { canceled: false, filePaths: ["/projects/selected"] };
      },
    },
  });

  assert.equal(selected, "/projects/selected");
  assert.deepEqual(received, {
    parentWindow: { id: "main" },
    options: {
      title: "Choose a project folder",
      buttonLabel: "Choose",
      defaultPath: "/projects/current",
      properties: ["openDirectory", "createDirectory"],
    },
  });
});

test("returns null when the picker is canceled", async () => {
  const selected = await showProjectFolderPicker({
    currentPath: 42,
    fallbackPath: "/projects/fallback",
    parentWindow: undefined,
    dialog: { async showOpenDialog() { return { canceled: true, filePaths: [] }; } },
  });

  assert.equal(selected, null);
});
