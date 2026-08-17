export async function showProjectFolderPicker(options) {
  const currentPath = typeof options.currentPath === "string" ? options.currentPath.trim() : "";
  const fallbackPath = typeof options.fallbackPath === "string" ? options.fallbackPath.trim() : "";
  const defaultPath = currentPath || fallbackPath || undefined;
  const result = await options.dialog.showOpenDialog(options.parentWindow, {
    title: "Choose a project folder",
    buttonLabel: "Choose",
    ...(defaultPath ? { defaultPath } : {}),
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled) return null;
  const selectedPath = result.filePaths?.[0];
  return typeof selectedPath === "string" && selectedPath.trim() ? selectedPath : null;
}
