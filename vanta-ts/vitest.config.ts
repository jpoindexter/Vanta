import { availableParallelism } from "node:os";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Several integration suites launch Node, Seatbelt, browser, or tmux child
    // processes. Saturating all 12 logical CPUs caused process-start delays to
    // trip real 2s sandbox limits and unrelated 20s test budgets. Preserve
    // parallelism while leaving capacity for those children.
    maxWorkers: Math.max(1, Math.min(8, availableParallelism())),
    // The lsp/ts-service tests spin up the TypeScript compiler; under heavy
    // parallel load a cold compile can exceed vitest's 5s default. 20s gives
    // headroom without masking a genuinely hung test.
    testTimeout: 20_000,
    // Test-suite-wide env defaults (e.g. opt past the project-hooks trust gate).
    setupFiles: ["./vitest.setup.ts"],
  },
});
