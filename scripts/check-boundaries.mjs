#!/usr/bin/env node
// ARCH-BOUNDARY-FITNESS standalone runner (for the pre-commit hook / CLI).
// The real logic lives in vanta-ts/src/lint/boundaries.ts (TS, also run by
// architecture.test.ts in `npm test`). This thin wrapper runs it via tsx so the
// same checker enforces locally before CI.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "vanta-ts", "src", "lint", "boundaries.ts");
const res = spawnSync("npx", ["tsx", target], { cwd: join(root, "vanta-ts"), stdio: "inherit" });
process.exit(res.status ?? 1);
