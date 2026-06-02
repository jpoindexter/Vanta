#!/usr/bin/env node
// Global `argo` shim. Runs the TypeScript CLI via the package's local tsx,
// inheriting the TTY so the interactive session's readline works.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const pkg = dirname(dirname(fileURLToPath(import.meta.url))); // <pkg>/bin → <pkg>
const tsx = join(pkg, "node_modules", ".bin", "tsx");
const cli = join(pkg, "src", "cli.ts");

const child = spawn(tsx, [cli, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: pkg,
});
child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error(
    `argo: launch failed (${err.message}). Run \`npm install\` in ${pkg}.`,
  );
  process.exit(1);
});
