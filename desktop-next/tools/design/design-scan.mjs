// Counts hard-coded design values per file. Shared by the guard test and the baseline script.
//
// "Nothing hard-coded" means a colour, a radius or a text size is picked from the design system (a token or a
// scale step), never typed as a literal. The theme seeds (themes/*) and the token files (styles.css) are where
// literals are allowed to live: they ARE the system.
import fs from "node:fs";
import path from "node:path";

export const SRC = path.resolve(import.meta.dirname, "..", "..", "apps", "desktop", "src");

/**
 * Where literal values are the definition, not a violation: the theme seeds, the token file, and the places that hold
 * third-party colours by design (a service's brand colour, the terminal and code-editor palettes).
 */
const ALLOWED = [
  /^themes\//,
  /^styles\.css$/,
  /^i18n\//,
  /\.generated\./,
  /^lib\/mcp-brands\.tsx$/,
  /^app\/messaging\/platform-icon\.tsx$/,
  /^components\/chat\/code-editor-theme\.ts$/,
  /^app\/right-sidebar\/terminal\/selection\.ts$/,
  // Seeds and palettes that ARE the system: the accent presets, the brand mark, the annotation tokens, the markup injected
  // into other pages, the syntax palette and the star map's category palette.
  /^components\/onboarding-chat\/options\.tsx$/,
  /^components\/brand-mark\.tsx$/,
  /^lib\/preview-annotate\//,
  /^lib\/preview-act\//,
  /^components\/chat\/shiki-config\.ts$/,
  /^app\/settings\/billing\//,
  /^components\/chat\/vibe-hearts\.tsx$/,
  /^components\/pane-shell\/tree\/zones-engine\.ts$/,
  /^plugins\/bots\/avatar\.tsx$/,
  /^app\/starmap\/color\.ts$/,
  // Hermes surfaces that are switched off in Vanta (app/settings/vanta-extras.ts) and dev-only tooling.
  /^plugins\/kanban\//,
  /^components\/pet\//,
  /^debug\//,
];

/** A comment is prose: `#81114` in one is an issue number, not a colour. */
export const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const TOKEN_CSS_RADIUS = /border(?:-(?:top|bottom)-(?:left|right))?-radius:\s*([^;}]+)/g;

export const CATEGORIES = {
  /** #rgb / #rrggbb / #rrggbbaa typed in code or CSS. */
  "hex-color": { files: /\.(ts|tsx|css)$/, count: (text) => (stripComments(text).match(/(?<!&)(?:#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b)/g) ?? []).length },
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
  /**
   * A coloured bar hung on the left edge of a card, row or callout: the stock AI-generated "accent stripe". It says
   * nothing the content does not (status goes in a label, a dot or the text colour). Neutral 1px dividers and
   * blockquote rules are fine. Applies everywhere, including the surfaces other categories exempt.
   */
  "left-accent-stripe": {
    files: /\.(ts|tsx|css)$/,
    everywhere: true,
    count: (text) => {
      const code = stripComments(text);
      const patterns = [
        /\bborderLeft(?:Color)?\s*:\s*[`"'][^`"']*\b(?:solid|\$\{)/g, // inline style: borderLeft: `2px solid ${tone}`
        /\bborderLeftColor\s*:\s*(?!p\.)[\w.]+/g, // inline style: borderLeftColor: meta.tone (editor cursor tokens use p.*)
        /\bbefore:(?:-?left-\S+\s+)?[^"'`]*\bbefore:w-(?:0\.5|1|\[)/g, // a 2-4px pseudo-element bar down the left side
        /border-l-[234]\b[^"'`]*\bborder-(?:primary|accent|destructive|\(--ui-accent|\(--ui-(?:red|blue|green|yellow|orange|purple))/g, // coloured utility stripe
        /border-(?:left|inline-start):\s*[2-9]px\s+solid/g, // css: 2px or thicker
      ];
      return patterns.reduce((sum, pattern) => sum + (code.match(pattern) ?? []).length, 0);
    },
  },
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
    if (/\.test\.|\.spec\./.test(rel)) continue;
    const allowed = ALLOWED.some((pattern) => pattern.test(rel));
    const text = fs.readFileSync(file, "utf8");
    for (const [name, category] of Object.entries(CATEGORIES)) {
      if (!category.files.test(rel) || (allowed && !category.everywhere)) continue;
      const n = category.count(text, rel);
      if (n > 0) result[name][rel] = n;
    }
  }
  return result;
}

export const total = (perFile) => Object.values(perFile).reduce((sum, n) => sum + n, 0);
