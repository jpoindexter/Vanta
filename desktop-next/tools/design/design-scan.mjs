// Counts hard-coded design values per file. Shared by the guard test and the baseline script.
//
// "Nothing hard-coded" means a colour, a radius or a text size is picked from the design system (a token or a
// scale step), never typed as a literal. The theme seeds (themes/*) and the token files (styles.css) are where
// literals are allowed to live: they ARE the system.
import fs from "node:fs";
import path from "node:path";

export const SRC = path.resolve(import.meta.dirname, "..", "..", "apps", "desktop", "src");

/** Where literal values are the definition, not a violation. */
const ALLOWED = [/^themes\//, /^styles\.css$/, /^i18n\//, /\.generated\./];

const TOKEN_CSS_RADIUS = /border(?:-(?:top|bottom)-(?:left|right))?-radius:\s*([^;}]+)/g;

export const CATEGORIES = {
  /** #rgb / #rrggbb / #rrggbbaa typed in code or CSS. */
  "hex-color": { files: /\.(ts|tsx|css)$/, count: (text) => (text.match(/#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? []).length },
  /** A corner radius written as a length instead of a ramp step or semantic name. */
  "literal-radius": {
    files: /\.(tsx|css)$/,
    count: (text, file) => {
      if (file.endsWith(".css")) {
        let n = 0;
        for (const [, value] of text.matchAll(TOKEN_CSS_RADIUS)) if (/\d(px|rem|em)\b/.test(value) && !/var\(/.test(value)) n += 1;
        return n;
      }
      return (text.match(/\brounded(?:-(?:t|b|l|r|tl|tr|bl|br|s|e))?-\[\d*\.?\d+(?:px|rem)\]/g) ?? []).length;
    },
  },
  /** bg-[#...] text-[#...] and the like. */
  "arbitrary-color": { files: /\.tsx$/, count: (text) => (text.match(/\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|shadow|accent|caret)-\[#/g) ?? []).length },
  /** text-[13px]: a text size that is not on the type scale. */
  "arbitrary-text-size": { files: /\.tsx$/, count: (text) => (text.match(/\btext-\[\d*\.?\d+(?:px|rem)\]/g) ?? []).length },
};

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__fixtures__") continue;
      yield* walk(full);
    } else yield full;
  }
}

/** { category: { "relative/path.tsx": count } } with zero counts left out. */
export function scan(root = SRC) {
  const result = Object.fromEntries(Object.keys(CATEGORIES).map((name) => [name, {}]));
  for (const file of walk(root)) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    if (/\.test\.|\.spec\./.test(rel) || ALLOWED.some((pattern) => pattern.test(rel))) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const [name, category] of Object.entries(CATEGORIES)) {
      if (!category.files.test(rel)) continue;
      const n = category.count(text, rel);
      if (n > 0) result[name][rel] = n;
    }
  }
  return result;
}

export const total = (perFile) => Object.values(perFile).reduce((sum, n) => sum + n, 0);
