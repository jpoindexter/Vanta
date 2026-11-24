// Finds the old product's name (Hermes) and its publisher's brand (Nous) in shipped source.
//
// Vanta is its own product. The words may appear only where they are required or where they are the subject:
//   - the MIT licence and notice files (attribution is a licence condition),
//   - the code that migrates saved state from the old key names,
//   - the tests and scripts that CHECK the old brand is absent,
//   - the Company page's worker runtime, which is a real third-party agent Vanta can run.
// Historical port notes under docs/ are not shipped source and are not scanned.
import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "..", "..");
const SCAN_DIRS = ["apps/desktop/src", "apps/desktop/electron", "apps/desktop/scripts", "apps/shared/src", "tools"];
const SCAN_TOP = ["package.json", "apps/desktop/package.json", "apps/shared/package.json", "apps/desktop/vite.config.ts", "apps/desktop/vitest.config.ts", "apps/desktop/index.html", "apps/desktop/electron-builder.config.cjs", "apps/desktop/product-identity.cjs", "apps/desktop/update-feed.cjs"];
const EXT = /\.(ts|tsx|mts|cts|mjs|cjs|js|css|html|json)$/;

/** Where the old name is allowed to appear. */
export const ALLOWED = [
  /^apps\/desktop\/src\/app\/vanta\/company\//, // the Hermes agent as a worker Vanta can run
  /^apps\/desktop\/src\/lib\/legacy-storage-migrate(\.test)?\.ts$/, // reads the old key names on purpose
  /^apps\/desktop\/src\/i18n\/brand-free\.test\.ts$/,
  /^apps\/desktop\/src\/components\/brand-mark\.test\.tsx$/,
  /^apps\/desktop\/src\/components\/chat\/vanta\/empty-state\.test\.tsx$/, // asserts the old wordmark is gone
  /^apps\/desktop\/src\/themes\/presets\.network\.test\.ts$/,
  /^apps\/desktop\/src\/styles\/brand-guard\.test\.ts$/,
  /^tools\/brand\//,
  /^tools\/proof\/rows-thread\.mjs$/,
  /^tools\/packaging\/bundle-report\.mjs$/,
  /^tools\/design\//, // comments that name what the scanner exempts
  /\/__fixtures__\//,
];

/** The old product name, any case; the publisher's brand where it is not the French word "nous" or "synchronous". */
const PATTERNS = [
  { name: "hermes", re: /hermes/i },
  { name: "nous-brand", re: /nousresearch|nous research|(?<![A-Za-z])nous[-_A-Z]|nous[A-Z_]|[A-Z_-]nous\b|\bNOUS(?:_|\b)|(?<![A-Za-z])Nous(?= (?:account|portal|tool|gateway|auth|sign|free|subscription))/ },
];
const FRENCH = /^apps\/desktop\/src\/i18n\/fr/;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", "release", "build"].includes(entry.name)) continue;
      yield* walk(full);
    } else yield full;
  }
}

/** { "relative/path": [{ line, text, name }] } for every non-allowed match. */
export function scan(root = ROOT) {
  const found = {};
  const files = SCAN_DIRS.flatMap((d) => (fs.existsSync(path.join(root, d)) ? [...walk(path.join(root, d))] : []));
  for (const top of SCAN_TOP) if (fs.existsSync(path.join(root, top))) files.push(path.join(root, top));
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    if (!EXT.test(rel) || ALLOWED.some((a) => a.test(rel))) continue;
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((text, i) => {
      for (const { name, re } of PATTERNS) {
        if (name === "nous-brand" && FRENCH.test(rel) && !/nousresearch|nous research|NOUS/i.test(text)) continue;
        if (re.test(text)) (found[rel] ??= []).push({ line: i + 1, name, text: text.trim().slice(0, 140) });
      }
    });
  }
  return found;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const found = scan();
  const files = Object.keys(found);
  const total = files.reduce((n, f) => n + found[f].length, 0);
  console.log(`${total} match(es) in ${files.length} file(s)`);
  for (const f of files.sort((a, b) => found[b].length - found[a].length).slice(0, 30)) console.log(`${String(found[f].length).padStart(4)} ${f}  e.g. ${found[f][0].line}: ${found[f][0].text}`);
}
