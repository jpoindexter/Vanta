// Paths, argument parsing and a stable, diff-friendly JSON writer.
import fs from "node:fs";
import path from "node:path";

export const DESKTOP_NEXT = path.resolve(import.meta.dirname, "..", "..");
export const PARITY_DOCS = path.join(DESKTOP_NEXT, "docs", "parity");
export const WIREFRAME_HTML = path.join(DESKTOP_NEXT, "docs", "wireframe", "vanta-desktop-wireframe.html");

/** `--flag value` and `--flag` (boolean) parser. Unknown flags are kept so callers can reject them. */
export function parseArgs(argv, booleans = []) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument "${arg}". Flags look like --name value.`);
    const name = arg.slice(2);
    if (booleans.includes(name)) out[name] = true;
    else if (i + 1 < argv.length) out[name] = argv[++i];
    else throw new Error(`--${name} needs a value.`);
  }
  return out;
}

export function rejectUnknown(args, known) {
  const bad = Object.keys(args).filter((k) => !known.includes(k));
  if (bad.length) throw new Error(`Unknown option(s): ${bad.map((b) => `--${b}`).join(", ")}. Known: ${known.map((k) => `--${k}`).join(", ")}.`);
}

const isPlain = (v) => v !== null && typeof v === "object";

function fmt(value, depth, inlineAt) {
  if (!isPlain(value)) return JSON.stringify(value);
  const inline = depth >= inlineAt || (Array.isArray(value) && value.every((v) => !isPlain(v)) && value.join("").length < 120);
  if (inline) return JSON.stringify(value);
  const pad = "  ".repeat(depth + 1);
  const end = "  ".repeat(depth);
  if (Array.isArray(value)) return `[\n${value.map((v) => pad + fmt(v, depth + 1, inlineAt)).join(",\n")}\n${end}]`;
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  if (!entries.length) return "{}";
  return `{\n${entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${fmt(v, depth + 1, inlineAt)}`).join(",\n")}\n${end}}`;
}

/** Pretty JSON that keeps everything at `inlineAt` nesting depth or deeper on one line. */
export function stringifyCompact(value, inlineAt = 4) {
  return `${fmt(value, 0, inlineAt)}\n`;
}

export function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
