import { failedOutput, RunOutputSchema, type DetectContext, type DetectResult, type ResumeInput, type RunInput, type RunOutput, type WorkerRuntime } from "./types.js";

// Holds the runtimes a company can hand tickets to. Every run goes through
// `guarded`, which turns a throw or a malformed result into a failed RunOutput
// so the engine only ever sees the validated shape.

export type RuntimeRegistry = {
  register: (runtime: WorkerRuntime) => void;
  get: (id: string) => WorkerRuntime | undefined;
  list: () => WorkerRuntime[];
  detectAll: (context: DetectContext) => Promise<DetectResult[]>;
  run: (id: string, input: RunInput) => Promise<RunOutput>;
  resume: (id: string, input: ResumeInput) => Promise<RunOutput>;
};

async function guarded(input: RunInput, call: () => Promise<RunOutput>): Promise<RunOutput> {
  if (input.signal.aborted) return failedOutput("aborted before start", "aborted");
  try {
    const parsed = RunOutputSchema.safeParse(await call());
    if (parsed.success) return parsed.data;
    return failedOutput(`runtime returned an invalid result: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  } catch (error) {
    return failedOutput(error instanceof Error ? error.message : String(error));
  }
}

function notInstalled(runtime: WorkerRuntime, reason: string): DetectResult {
  return { runtimeId: runtime.id, installed: false, command: null, version: null, auth: "unknown", selfApproving: runtime.selfApproving, reason };
}

export function createRuntimeRegistry(initial: WorkerRuntime[] = []): RuntimeRegistry {
  const runtimes = new Map<string, WorkerRuntime>();
  const registry: RuntimeRegistry = {
    register: (runtime) => { runtimes.set(runtime.id, runtime); },
    get: (id) => runtimes.get(id),
    list: () => [...runtimes.values()],
    detectAll: (context) => Promise.all(registry.list().map((runtime) =>
      runtime.detect(context).catch((error: unknown) => notInstalled(runtime, error instanceof Error ? error.message : String(error))))),
    run: async (id, input) => {
      const runtime = runtimes.get(id);
      if (!runtime) return failedOutput(`unknown worker runtime "${id}". Registered: ${[...runtimes.keys()].join(", ") || "(none)"}.`, "refused");
      return guarded(input, () => runtime.run(input));
    },
    resume: async (id, input) => {
      const runtime = runtimes.get(id);
      if (!runtime?.resume) return failedOutput(`runtime "${id}" cannot resume a session`, "refused");
      const resume = runtime.resume;
      return guarded(input, () => resume(input));
    },
  };
  for (const runtime of initial) registry.register(runtime);
  return registry;
}
