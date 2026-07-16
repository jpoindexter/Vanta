import { z } from "zod";
import { TASK_ENVIRONMENT_VERSION, type TaskEnvironment } from "./task-environment.js";

const RepoStateSchema = z.object({ files: z.record(z.string(), z.string()) });
const RepoObservationSchema = z.object({ paths: z.array(z.string()) });
const RepoActionSchema = z.object({ type: z.literal("write"), path: z.string().min(1), content: z.string() });
type RepoState = z.infer<typeof RepoStateSchema>;
type RepoAction = z.infer<typeof RepoActionSchema>;

export function createRepoFixture(): TaskEnvironment<RepoState, z.infer<typeof RepoObservationSchema>, RepoAction> {
  let state: RepoState = { files: {} };
  const observe = () => ({ paths: Object.keys(state.files).sort() });
  return {
    version: TASK_ENVIRONMENT_VERSION,
    id: "repo-fixture",
    sideEffect: "none",
    snapshotSchema: RepoStateSchema,
    observationSchema: RepoObservationSchema,
    legalActions: RepoActionSchema,
    snapshot: () => structuredClone(state),
    observe,
    predict: (_state, action) => ({ summary: `write ${action.path}` }),
    act: (action) => {
      state = { files: { ...state.files, [action.path]: action.content } };
      return observe();
    },
    terminal: (next) => next.files["notes.md"] === "done" ? "fixture_complete" : undefined,
    verify: (next, observed) => ({ ok: observed.paths.length === Object.keys(next.files).length, summary: "paths match snapshot" }),
  };
}

const BrowserStateSchema = z.object({ url: z.string(), fields: z.record(z.string(), z.string()) });
const BrowserObservationSchema = BrowserStateSchema;
const BrowserActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("navigate"), url: z.string().url() }),
  z.object({ type: z.literal("type"), selector: z.string().min(1), value: z.string() }),
]);
type BrowserState = z.infer<typeof BrowserStateSchema>;
type BrowserAction = z.infer<typeof BrowserActionSchema>;

export function createBrowserFixture(): TaskEnvironment<BrowserState, BrowserState, BrowserAction> {
  let state: BrowserState = { url: "about:blank", fields: {} };
  const observe = () => structuredClone(state);
  return {
    version: TASK_ENVIRONMENT_VERSION,
    id: "browser-fixture",
    sideEffect: "none",
    snapshotSchema: BrowserStateSchema,
    observationSchema: BrowserObservationSchema,
    legalActions: BrowserActionSchema,
    snapshot: observe,
    observe,
    predict: (_state, action) => ({ summary: action.type === "navigate" ? `navigate to ${action.url}` : `type into ${action.selector}` }),
    act: (action) => {
      state = action.type === "navigate"
        ? { ...state, url: action.url }
        : { ...state, fields: { ...state.fields, [action.selector]: action.value } };
      return observe();
    },
    terminal: () => undefined,
    verify: (next, observed) => ({ ok: JSON.stringify(next) === JSON.stringify(observed), summary: "observation matches snapshot" }),
  };
}

export function createMalformedObservationFixture(): TaskEnvironment<{ ready: boolean }, { ready: boolean }, { type: "wait" }> {
  return {
    version: TASK_ENVIRONMENT_VERSION,
    id: "malformed-observation-fixture",
    sideEffect: "none",
    snapshotSchema: z.object({ ready: z.boolean() }),
    observationSchema: z.object({ ready: z.boolean() }),
    legalActions: z.object({ type: z.literal("wait") }),
    snapshot: () => ({ ready: true }),
    observe: () => ({}),
    predict: () => ({ summary: "wait" }),
    act: () => ({ ready: true }),
    terminal: () => undefined,
    verify: () => ({ ok: true, summary: "not reached" }),
  };
}

export function createMalformedActObservationFixture(): TaskEnvironment<
  { ready: boolean },
  { ready: boolean },
  { type: "wait" }
> {
  return {
    version: TASK_ENVIRONMENT_VERSION,
    id: "malformed-act-observation-fixture",
    sideEffect: "none",
    snapshotSchema: z.object({ ready: z.boolean() }),
    observationSchema: z.object({ ready: z.boolean() }),
    legalActions: z.object({ type: z.literal("wait") }),
    snapshot: () => ({ ready: true }),
    observe: () => ({ ready: true }),
    predict: () => ({ summary: "wait" }),
    act: () => ({}),
    terminal: () => undefined,
    verify: () => ({ ok: true, summary: "not reached" }),
  };
}
