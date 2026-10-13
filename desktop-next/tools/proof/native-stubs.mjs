// Stands in for the parts of the OS a hidden proof run must not touch: native dialogs, Finder, the Trash and the
// default browser. The stubs are installed on Electron's own `dialog` and `shell` objects in the main process, so
// the app's real handlers run and only the final OS call is replaced. Every call is recorded for the proof to read.
import fs from "node:fs";
import path from "node:path";

/** Install the stubs. `answers` sets what the dialogs reply with; change it later with `setAnswers`. */
export async function installNativeStubs(app, answers) {
  await app.app.evaluate(({ dialog, shell }, initial) => {
    const log = (globalThis.__proof = { answers: initial, dialogs: [], external: [], opened: [], revealed: [], saves: [], trashed: [] });
    dialog.showMessageBox = async (...args) => {
      const options = args.at(-1);
      log.dialogs.push({ buttons: options.buttons, detail: options.detail, message: options.message });
      return { response: log.answers.confirm ? 0 : 1 };
    };
    dialog.showSaveDialog = async (...args) => {
      const options = args.at(-1);
      log.saves.push({ defaultPath: options.defaultPath, title: options.title });
      return log.answers.savePath ? { canceled: false, filePath: log.answers.savePath } : { canceled: true };
    };
    dialog.showOpenDialog = async (...args) => {
      const options = args.at(-1);
      log.dialogs.push({ message: options.title ?? "open dialog", picker: true });
      return log.answers.pickFolder ? { canceled: false, filePaths: [log.answers.pickFolder] } : { canceled: true, filePaths: [] };
    };
    shell.showItemInFolder = (target) => log.revealed.push(target);
    shell.openExternal = async (url) => void log.external.push(url);
    shell.openPath = async (target) => (log.opened.push(target), "");
    shell.trashItem = async (target) => void log.trashed.push(target);
  }, answers);
}

export const setAnswers = (app, patch) =>
  app.app.evaluate((_electron, next) => Object.assign(globalThis.__proof.answers, next), patch);

export const readNativeLog = (app) => app.app.evaluate(() => JSON.parse(JSON.stringify(globalThis.__proof)));

export const clearNativeLog = (app) =>
  app.app.evaluate(() => {
    const log = globalThis.__proof;
    for (const key of ["dialogs", "external", "opened", "revealed", "saves", "trashed"]) log[key].length = 0;
  });

/** A second throwaway git project to switch to. */
export function makeSecondProject(root) {
  const dir = path.join(root, "project", "beta-notes");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "NOTES.md"), "# Beta notes\n");
  return dir;
}
