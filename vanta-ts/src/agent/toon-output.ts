import { toonCompress, estTokens } from "winnow";
import { applyCodeCompression } from "../compress/apply.js";
import { stashOriginal } from "../compress/store.js";

// TOON tool-output compression helpers, extracted from dispatch-helpers.ts (size
// gate). Pure/best-effort lossless table views; consumed by compressOutput.

/** Opt in to columnar (dictionary) TOON — bigger lossless savings on low-cardinality data,
 * at some readability cost (the model resolves dictionary indices). Default plain TOON. */
export function toonDict(): boolean {
  const v = (process.env.VANTA_TOON_DICT ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

/** How to read the produced table (plain vs columnar). Pure. */
function toonNote(toon: string): string {
  return toon.startsWith("TOONC ")
    ? "[winnow: lossless columnar TOON — a JSON header (cols/const/dict) then one indexed record per line]"
    : "[winnow: lossless TOON table — keys in row 1, one record per line]";
}

/** Wrap object-array output as a lossless TOON table (every row kept), or null when it
 * isn't an object-array / too small to bother. Honors VANTA_TOON_DICT. */
export function toonView(output: string): { output: string; tokensSaved: number } | null {
  const toon = output.length >= 400 ? toonCompress(output, { dictionary: toonDict() }) : null;
  if (!toon) return null;
  const out = `${toon}\n${toonNote(toon)}`;
  return { output: out, tokensSaved: Math.max(0, estTokens(output) - estTokens(out)) };
}

/** read_file compression: AST skeleton for TS/JS; a lossless TOON view for large JSON
 * object-arrays (exact bytes stashed for retrieval — edit_file is string-based, so a
 * stale match just errors, never corrupts); untouched otherwise. Opt out: VANTA_TOON_READFILE=0,
 * opt in to columnar with VANTA_TOON_DICT=1. */
export async function compressReadFile(output: string, vantaDir: string): Promise<{ output: string; tokensSaved: number }> {
  const applied = await applyCodeCompression(output, vantaDir);
  if (applied.tokensSaved > 0) return { output: applied.output, tokensSaved: applied.tokensSaved };
  if (process.env.VANTA_TOON_READFILE === "0") return { output: applied.output, tokensSaved: 0 };
  const toon = output.length >= 400 ? toonCompress(output, { dictionary: toonDict() }) : null;
  if (!toon) return { output: applied.output, tokensSaved: 0 };
  const id = await stashOriginal(vantaDir, output);
  const fmt = toon.startsWith("TOONC ") ? "columnar TOON" : "TOON";
  const out = `${toon}\n[winnow: lossless ${fmt} view of a JSON file (every row kept). The file on disk is unchanged JSON — call retrieve_original id="${id}" for the exact bytes before editing; do not write this view back.]`;
  return { output: out, tokensSaved: Math.max(0, estTokens(output) - estTokens(out)) };
}
