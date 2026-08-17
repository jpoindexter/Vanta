import assert from "node:assert/strict";
import test from "node:test";
import { createPendingProjectTaskStore, prepareProjectSwitch, validateNewTaskDraft } from "./project-switch.mjs";

const draft = Object.freeze({
  agent: "Operator",
  host: "Local Mac",
  folder: "/projects/selected",
  branch: "main",
  model: "gpt-5",
  prompt: "Keep this instruction after switching.",
  worktree: true,
  approvals: true,
});

test("validates and canonicalizes a project switch before retaining the draft", async () => {
  const prepared = await prepareProjectSwitch(draft, {
    realpath: async () => "/private/projects/selected",
    stat: async () => ({ isDirectory: () => true }),
    createId: () => "switch-1",
  });

  assert.deepEqual(prepared, {
    id: "switch-1",
    targetRoot: "/private/projects/selected",
    draft: { ...draft, folder: "/private/projects/selected" },
  });
});

test("rejects non-directories and malformed renderer payloads", async () => {
  assert.throws(() => validateNewTaskDraft({ ...draft, folder: "relative/path" }), /absolute project folder/);
  assert.throws(() => validateNewTaskDraft({ ...draft, approvals: "yes" }), /safety settings/);
  await assert.rejects(
    prepareProjectSwitch(draft, { realpath: async (value) => value, stat: async () => ({ isDirectory: () => false }) }),
    /not available/,
  );
});

test("retains a draft until the matching project acknowledges it", () => {
  const store = createPendingProjectTaskStore();
  const pending = { id: "switch-1", targetRoot: "/projects/selected", draft };
  store.set(pending);

  assert.equal(store.read("/projects/other"), null);
  assert.equal(store.acknowledge("switch-1", "/projects/other"), false);
  assert.equal(store.read("/projects/selected"), pending);
  assert.equal(store.acknowledge("wrong", "/projects/selected"), false);
  assert.equal(store.acknowledge("switch-1", "/projects/selected"), true);
  assert.equal(store.read("/projects/selected"), null);
});
