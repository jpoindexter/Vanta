export type ClauseSplitterOptions = {
  minChars?: number;
  maxChars?: number;
};

const DEFAULT_MIN_CHARS = 24;
const DEFAULT_MAX_CHARS = 240;
const ABBREVIATIONS = new Set([
  "dr",
  "e.g",
  "etc",
  "i.e",
  "jr",
  "mr",
  "mrs",
  "ms",
  "prof",
  "sr",
  "st",
  "vs",
]);

function clamp(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value!)));
}

function wordBefore(text: string, index: number): string {
  return text
    .slice(0, index)
    .match(/([A-Za-z](?:[A-Za-z.]*)?)$/)?.[1]
    ?.toLowerCase() ?? "";
}

function isBoundary(text: string, index: number): boolean {
  const char = text[index];
  if (char === "\n" || char === ";" || char === ":" || char === "!" || char === "?") {
    return true;
  }
  if (char !== ".") return false;
  const previous = text[index - 1];
  const next = text[index + 1];
  if (previous && next && /\d/.test(previous) && /\d/.test(next)) return false;
  const word = wordBefore(text, index);
  if (ABBREVIATIONS.has(word)) return false;
  if (/^[a-z]\.$/i.test(word)) return false;
  return true;
}

function hardSplitAt(text: string, maxChars: number): number {
  const beforeLimit = text.slice(0, maxChars + 1);
  const whitespace = Math.max(
    beforeLimit.lastIndexOf(" "),
    beforeLimit.lastIndexOf("\t"),
    beforeLimit.lastIndexOf("\n"),
  );
  return whitespace > 0 ? whitespace + 1 : maxChars;
}

/**
 * Incrementally turns token deltas into speakable clauses. Punctuation is the
 * primary boundary; maxChars is a hard latency/memory guard for long run-ons.
 */
export class ClauseSplitter {
  private buffer = "";
  readonly minChars: number;
  readonly maxChars: number;

  constructor(options: ClauseSplitterOptions = {}) {
    this.minChars = clamp(options.minChars, DEFAULT_MIN_CHARS, 1, 500);
    this.maxChars = clamp(
      options.maxChars,
      DEFAULT_MAX_CHARS,
      this.minChars,
      2_000,
    );
  }

  push(delta: string): string[] {
    if (!delta) return [];
    this.buffer += delta;
    return this.drain(false);
  }

  flush(): string[] {
    return this.drain(true);
  }

  reset(): void {
    this.buffer = "";
  }

  pending(): string {
    return this.buffer;
  }

  private drain(flush: boolean): string[] {
    const clauses: string[] = [];
    while (this.buffer.length > 0) {
      let splitAt = -1;
      for (let index = 0; index < this.buffer.length; index += 1) {
        if (!isBoundary(this.buffer, index)) continue;
        const candidate = this.buffer.slice(0, index + 1).trim();
        if (candidate.length >= this.minChars) {
          splitAt = index + 1;
          break;
        }
      }
      if (splitAt < 0 && this.buffer.length > this.maxChars) {
        splitAt = hardSplitAt(this.buffer, this.maxChars);
      }
      if (splitAt < 0) break;
      const clause = this.buffer.slice(0, splitAt).trim();
      this.buffer = this.buffer.slice(splitAt).trimStart();
      if (clause) clauses.push(clause);
    }
    if (flush) {
      const tail = this.buffer.trim();
      this.buffer = "";
      if (tail) clauses.push(tail);
    }
    return clauses;
  }
}
