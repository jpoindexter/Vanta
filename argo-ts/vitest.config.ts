import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The lsp/ts-service tests spin up the TypeScript compiler; under heavy
    // parallel load a cold compile can exceed vitest's 5s default. 20s gives
    // headroom without masking a genuinely hung test.
    testTimeout: 20_000,
  },
});
