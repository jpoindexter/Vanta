#!/usr/bin/env node
// Architectural fitness CLI — same rules as src/architecture.test.ts, runnable
// standalone (CI / pre-commit). Exits non-zero on a new boundary violation.
// Run from repo root: node scripts/check-boundaries.mjs

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const tsRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "vanta-ts");
const res = spawnSync("npx", ["tsx", "src/arch/cli.ts"], { cwd: tsRoot, stdio: "inherit" });
process.exit(res.status ?? 1);
