// Moves literal corner radii onto the one ramp (src/styles.css): 2 / 4 / 6 / 8 / 10 / 12 px and the pill.
//
//   node tools/design/codemod-radius.mjs          dry run: counts what would change
//   node tools/design/codemod-radius.mjs --write  rewrite the files
//
// CSS `border-radius: 8px` becomes `var(--radius-lg)`; a Tailwind `rounded-[8px]` becomes `rounded-lg`.
// Left alone on purpose: 0, 50% (a circle), inherit, anything already a var(), and `rounded-[inherit]`.
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(import.meta.dirname, "..", "..", "apps", "desktop", "src");
const WRITE = process.argv.includes("--write");
const PILL_FROM_PX = 999;

/** px -> ramp step name. Anything above 24px is a surface, so it lands on the largest step. */
function stepFor(px) {
  if (px >= PILL_FROM_PX) return "pill";
  if (px <= 2) return "xs";
  if (px <= 4) return "sm";
  if (px <= 6) return "md";
  if (px <= 8) return "lg";
  if (px <= 10) return "xl";
  return "2xl";
}

const toPx = (value, unit) => (unit === "rem" || unit === "em" ? Number(value) * 16 : Number(value));
const LENGTH = /^(\d*\.?\d+)(px|rem|em)$/;

/** One CSS length -> `var(--radius-*)`, or null when it should stay as written. */
function cssToken(length) {
  const m = LENGTH.exec(length.trim());
  if (!m) return null;
  const px = toPx(m[1], m[2]);
  if (px === 0) return null;
  const step = stepFor(px);
  return step === "pill" ? "var(--radius-pill)" : `var(--radius-${step})`;
}

function rewriteCss(text) {
  let changed = 0;
  const out = text.replace(/(border(?:-(?:top|bottom)-(?:left|right))?-radius:\s*)([^;}]+)(;?)/g, (whole, head, value, tail) => {
    const parts = value.trim().split(/\s+/);
    const next = parts.map((part) => cssToken(part) ?? part);
    if (next.join(" ") === parts.join(" ")) return whole;
    changed += 1;
    return `${head}${next.join(" ")}${tail}`;
  });
  return { out, changed };
}

function rewriteTsx(text) {
  let changed = 0;
  const out = text.replace(/\brounded((?:-(?:t|b|l|r|tl|tr|bl|br|s|e))?)-\[(\d*\.?\d+)(px|rem)\]/g, (whole, side, value, unit) => {
    const step = stepFor(toPx(value, unit));
    if (step === "pill") return `rounded${side}-full`;
    changed += 1;
    return `rounded${side}-${step}`;
  });
  return { out, changed };
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(css|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) yield full;
  }
}

let files = 0;
let edits = 0;
for (const file of walk(SRC)) {
  const text = fs.readFileSync(file, "utf8");
  const { out, changed } = file.endsWith(".css") ? rewriteCss(text) : rewriteTsx(text);
  if (!changed) continue;
  files += 1;
  edits += changed;
  if (WRITE) fs.writeFileSync(file, out);
}
console.log(`${WRITE ? "rewrote" : "would rewrite"} ${edits} radius value(s) in ${files} file(s)`);
