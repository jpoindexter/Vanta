import { randomUUID } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";

const STRING_LIMITS = Object.freeze({
  agent: 64,
  host: 128,
  folder: 4096,
  branch: 256,
  model: 512,
  prompt: 200_000,
});

function boundedString(value, field) {
  if (typeof value !== "string") throw new Error(`New task ${field} must be text.`);
  if (value.length > STRING_LIMITS[field]) throw new Error(`New task ${field} is too long.`);
  return value;
}

export function validateNewTaskDraft(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("New task details are invalid.");
  const draft = {
    agent: boundedString(value.agent, "agent"),
    host: boundedString(value.host, "host"),
    folder: boundedString(value.folder, "folder").trim(),
    branch: boundedString(value.branch, "branch"),
    model: boundedString(value.model, "model"),
    prompt: boundedString(value.prompt, "prompt"),
    worktree: value.worktree,
    approvals: value.approvals,
  };
  if (!draft.folder || !isAbsolute(draft.folder)) throw new Error("Choose an absolute project folder.");
  if (typeof draft.worktree !== "boolean" || typeof draft.approvals !== "boolean") {
    throw new Error("New task safety settings are invalid.");
  }
  return Object.freeze(draft);
}

export async function prepareProjectSwitch(value, dependencies = {}) {
  const draft = validateNewTaskDraft(value);
  const resolveRealpath = dependencies.realpath ?? realpath;
  const readStat = dependencies.stat ?? stat;
  const createId = dependencies.createId ?? randomUUID;
  let targetRoot;
  try {
    targetRoot = await resolveRealpath(draft.folder);
    const targetStat = await readStat(targetRoot);
    if (!targetStat.isDirectory()) throw new Error("not a directory");
  } catch {
    throw new Error("The selected project folder is not available.");
  }
  return Object.freeze({
    id: createId(),
    targetRoot,
    draft: Object.freeze({ ...draft, folder: targetRoot }),
  });
}

export function createPendingProjectTaskStore() {
  let pending = null;
  return Object.freeze({
    set(value) {
      pending = value;
    },
    read(currentRoot) {
      return pending?.targetRoot === currentRoot ? pending : null;
    },
    acknowledge(id, currentRoot) {
      if (!pending || pending.id !== id || pending.targetRoot !== currentRoot) return false;
      pending = null;
      return true;
    },
  });
}
