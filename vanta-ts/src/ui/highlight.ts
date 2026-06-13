export type HlClass = "keyword" | "string" | "comment" | "number" | "plain";
export type HlSeg = { text: string; cls: HlClass };

/** Tokenize ONE line of code into ordered segments. Concatenation of all
 *  segment .text equals the input line exactly (lossless). Supported langs:
 *  ts, tsx, js, jsx, json, bash, sh, py, python, rust, go — unknown falls
 *  back to all-plain. Line-based; the markdown renderer feeds one line at a time. */
export function highlightLine(line: string, lang: string): HlSeg[] {
  const norm = lang.trim().toLowerCase();
  if (norm === "json") return scanJson(line);
  return scan(line, COMMENT_PREFIX[norm] ?? null, KEYWORDS[norm] ?? EMPTY_SET);
}

// ---------------------------------------------------------------------------
// Language tables (cx stays ≤10 — lookup replaces switch chains)
// ---------------------------------------------------------------------------

const EMPTY_SET: ReadonlySet<string> = new Set();

const KEYWORDS: Record<string, ReadonlySet<string>> = {
  ts:  new Set(["const","let","var","function","return","if","else","for","while","class","interface","type","import","export","from","async","await","new","extends","implements","public","private","readonly","void","null","undefined","true","false","this"]),
  tsx: new Set(["const","let","var","function","return","if","else","for","while","class","interface","type","import","export","from","async","await","new","extends","implements","public","private","readonly","void","null","undefined","true","false","this"]),
  js:  new Set(["const","let","var","function","return","if","else","for","while","class","interface","type","import","export","from","async","await","new","extends","implements","public","private","readonly","void","null","undefined","true","false","this"]),
  jsx: new Set(["const","let","var","function","return","if","else","for","while","class","interface","type","import","export","from","async","await","new","extends","implements","public","private","readonly","void","null","undefined","true","false","this"]),
  py:     new Set(["def","class","return","if","elif","else","for","while","import","from","as","with","try","except","finally","lambda","None","True","False","and","or","not","in","is","async","await"]),
  python: new Set(["def","class","return","if","elif","else","for","while","import","from","as","with","try","except","finally","lambda","None","True","False","and","or","not","in","is","async","await"]),
  bash: new Set(["if","then","fi","for","in","do","done","while","case","esac","function","return","export","local","echo"]),
  sh:   new Set(["if","then","fi","for","in","do","done","while","case","esac","function","return","export","local","echo"]),
  rust: new Set(["fn","let","mut","pub","struct","enum","impl","trait","use","mod","match","if","else","for","while","loop","return","self","Self","async","await"]),
  go:   new Set(["func","var","const","type","struct","interface","package","import","return","if","else","for","range","go","defer","chan","map"]),
};

const COMMENT_PREFIX: Record<string, string> = {
  ts: "//", tsx: "//", js: "//", jsx: "//", rust: "//", go: "//",
  py: "#", python: "#", bash: "#", sh: "#",
};

// ---------------------------------------------------------------------------
// Regexes (sticky — reset lastIndex before each use)
// ---------------------------------------------------------------------------

const RE_NUMBER  = /\b(0x[0-9a-fA-F]+|\d[\d_]*(?:\.\d+)?)\b/y;
const RE_WORD    = /[A-Za-z_$][\w$]*/y;

// ---------------------------------------------------------------------------
// Helpers shared by both scanners
// ---------------------------------------------------------------------------

function pushPlain(segs: HlSeg[], plain: string): void {
  if (plain) segs.push({ text: plain, cls: "plain" });
}

function scanString(line: string, i: number, q: string): { seg: HlSeg; end: number } {
  let j = i + 1;
  while (j < line.length) {
    if (line[j] === "\\") { j += 2; continue; }
    if (line[j] === q)    { j++;    break;    }
    j++;
  }
  return { seg: { text: line.slice(i, j), cls: "string" }, end: j };
}

// ---------------------------------------------------------------------------
// Generic scanner (non-JSON)
// ---------------------------------------------------------------------------

function tryBlockComment(line: string, i: number): HlSeg | null {
  if (line[i] !== "/" || line[i + 1] !== "*") return null;
  const close = line.indexOf("*/", i + 2);
  if (close === -1) return null;
  return { text: line.slice(i, close + 2), cls: "comment" };
}

function tryNumber(line: string, i: number): HlSeg | null {
  RE_NUMBER.lastIndex = i;
  const m = RE_NUMBER.exec(line);
  return m ? { text: m[0], cls: "number" } : null;
}

function tryWord(line: string, i: number, kw: ReadonlySet<string>): HlSeg | null {
  RE_WORD.lastIndex = i;
  const m = RE_WORD.exec(line);
  return m ? { text: m[0], cls: kw.has(m[0]) ? "keyword" : "plain" } : null;
}

function scan(line: string, commentPrefix: string | null, kw: ReadonlySet<string>): HlSeg[] {
  const segs: HlSeg[] = [];
  let i = 0;
  let plain = "";

  while (i < line.length) {
    const blockCmt = tryBlockComment(line, i);
    if (blockCmt) {
      pushPlain(segs, plain); plain = "";
      segs.push(blockCmt);
      i += blockCmt.text.length;
      continue;
    }

    if (commentPrefix && line.startsWith(commentPrefix, i)) {
      pushPlain(segs, plain); plain = "";
      segs.push({ text: line.slice(i), cls: "comment" });
      i = line.length;
      continue;
    }

    const q = line[i];
    if (q === "'" || q === '"' || q === "`") {
      pushPlain(segs, plain); plain = "";
      const { seg, end } = scanString(line, i, q);
      segs.push(seg); i = end;
      continue;
    }

    const num = tryNumber(line, i);
    if (num) {
      pushPlain(segs, plain); plain = "";
      segs.push(num); i += num.text.length;
      continue;
    }

    const word = tryWord(line, i, kw);
    if (word) {
      pushPlain(segs, plain); plain = "";
      segs.push(word); i += word.text.length;
      continue;
    }

    plain += line[i++];
  }

  pushPlain(segs, plain);
  return segs;
}

// ---------------------------------------------------------------------------
// JSON scanner
// ---------------------------------------------------------------------------

const KW_JSON    = new Set(["true", "false", "null"]);
const RE_JSON_STR = /"(?:[^"\\]|\\.)*"?/y;
const RE_JSON_NUM = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const RE_JSON_WORD = /[A-Za-z_][\w]*/y;

function tryJsonString(line: string, i: number): HlSeg | null {
  if (line[i] !== '"') return null;
  RE_JSON_STR.lastIndex = i;
  const m = RE_JSON_STR.exec(line);
  return m ? { text: m[0], cls: "string" } : null;
}

function tryJsonNumber(line: string, i: number): HlSeg | null {
  RE_JSON_NUM.lastIndex = i;
  const m = RE_JSON_NUM.exec(line);
  return m && m[0].length > 0 ? { text: m[0], cls: "number" } : null;
}

function tryJsonWord(line: string, i: number): HlSeg | null {
  RE_JSON_WORD.lastIndex = i;
  const m = RE_JSON_WORD.exec(line);
  return m ? { text: m[0], cls: KW_JSON.has(m[0]) ? "keyword" : "plain" } : null;
}

function scanJson(line: string): HlSeg[] {
  const segs: HlSeg[] = [];
  let i = 0;
  let plain = "";

  while (i < line.length) {
    const str = tryJsonString(line, i);
    if (str) {
      pushPlain(segs, plain); plain = "";
      segs.push(str); i += str.text.length;
      continue;
    }

    const num = tryJsonNumber(line, i);
    if (num) {
      pushPlain(segs, plain); plain = "";
      segs.push(num); i += num.text.length;
      continue;
    }

    const word = tryJsonWord(line, i);
    if (word) {
      pushPlain(segs, plain); plain = "";
      segs.push(word); i += word.text.length;
      continue;
    }

    plain += line[i++];
  }

  pushPlain(segs, plain);
  return segs;
}
