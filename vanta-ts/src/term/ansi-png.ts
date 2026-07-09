import { deflateSync } from "node:zlib";
import { mkdtemp, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

export type Rgb = readonly [number, number, number];
export type RenderOptions = { padding?: number; scale?: number; maxColumns?: number; maxRows?: number };
export type ClipboardResult = { ok: true; message: string; bytes: number } | { ok: false; message: string };

const DEFAULT_FG: Rgb = [232, 238, 244];
const DEFAULT_BG: Rgb = [9, 11, 15];
const CHAR_W = 6;
const CHAR_H = 8;

const ANSI_COLORS: readonly Rgb[] = [
  [0, 0, 0], [194, 69, 75], [67, 160, 71], [198, 151, 46],
  [69, 126, 186], [171, 89, 172], [59, 158, 180], [210, 214, 220],
];
const ANSI_BRIGHT: readonly Rgb[] = [
  [86, 91, 99], [255, 106, 116], [131, 242, 176], [255, 206, 107],
  [107, 220, 255], [183, 164, 255], [106, 220, 255], [255, 255, 255],
];

type Cell = { ch: string; fg: Rgb; bg: Rgb };

export function ansiToPng(text: string, opts: RenderOptions = {}): Buffer {
  const scale = Math.max(1, Math.floor(opts.scale ?? 2));
  const padding = Math.max(0, opts.padding ?? 12);
  const cells = parseAnsi(text, opts.maxColumns ?? 120, opts.maxRows ?? 80);
  const columns = Math.max(1, ...cells.map((l) => l.length));
  const rows = Math.max(1, cells.length);
  const width = padding * 2 + columns * CHAR_W * scale;
  const height = padding * 2 + rows * CHAR_H * scale;
  const rgba = Buffer.alloc(width * height * 4);
  fillRect(rgba, width, 0, 0, width, height, DEFAULT_BG);
  cells.forEach((line, row) => {
    line.forEach((cell, col) => drawCell(rgba, width, padding + col * CHAR_W * scale, padding + row * CHAR_H * scale, cell, scale));
  });
  return encodePng(width, height, rgba);
}

function parseAnsi(text: string, maxColumns: number, maxRows: number): Cell[][] {
  const lines: Cell[][] = [[]];
  let fg = DEFAULT_FG;
  let bg = DEFAULT_BG;
  let bold = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\x1b" && text[i + 1] === "[") {
      const end = text.indexOf("m", i + 2);
      if (end > -1) {
        ({ fg, bg, bold } = applySgr(text.slice(i + 2, end), { fg, bg, bold }));
        i = end;
        continue;
      }
    }
    const ch = text[i]!;
    if (ch === "\r") continue;
    if (ch === "\n") {
      if (lines.length >= maxRows) break;
      lines.push([]);
      continue;
    }
    const line = lines[lines.length - 1]!;
    if (line.length < maxColumns) line.push({ ch: normalizeChar(ch), fg, bg });
  }
  return lines;
}

function applySgr(raw: string, state: { fg: Rgb; bg: Rgb; bold: boolean }): { fg: Rgb; bg: Rgb; bold: boolean } {
  const codes = raw.split(";").filter(Boolean).map((n) => Number(n));
  const values = codes.length ? codes : [0];
  let { fg, bg, bold } = state;
  for (const code of values) {
    if (code === 0) { fg = DEFAULT_FG; bg = DEFAULT_BG; bold = false; }
    else if (code === 1) bold = true;
    else if (code === 22) bold = false;
    else if (code === 39) fg = DEFAULT_FG;
    else if (code === 49) bg = DEFAULT_BG;
    else if (code >= 30 && code <= 37) fg = (bold ? ANSI_BRIGHT : ANSI_COLORS)[code - 30]!;
    else if (code >= 90 && code <= 97) fg = ANSI_BRIGHT[code - 90]!;
    else if (code >= 40 && code <= 47) bg = ANSI_COLORS[code - 40]!;
    else if (code >= 100 && code <= 107) bg = ANSI_BRIGHT[code - 100]!;
  }
  return { fg, bg, bold };
}

function normalizeChar(ch: string): string {
  if (ch === "›" || ch === "→" || ch === "↳") return ">";
  if (ch === "⚙" || ch === "✓") return "*";
  if (ch === "✗") return "x";
  const code = ch.charCodeAt(0);
  return code >= 32 && code <= 126 ? ch : "?";
}

function drawCell(rgba: Buffer, width: number, x: number, y: number, cell: Cell, scale: number): void {
  fillRect(rgba, width, x, y, CHAR_W * scale, CHAR_H * scale, cell.bg);
  const glyph = glyphFor(cell.ch);
  for (let gy = 0; gy < glyph.length; gy++) {
    const row = glyph[gy]!;
    for (let gx = 0; gx < row.length; gx++) {
      if (row[gx] === "1") fillRect(rgba, width, x + gx * scale, y + gy * scale, scale, scale, cell.fg);
    }
  }
}

function fillRect(rgba: Buffer, width: number, x: number, y: number, w: number, h: number, color: Rgb): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const i = (yy * width + xx) * 4;
      rgba[i] = color[0]; rgba[i + 1] = color[1]; rgba[i + 2] = color[2]; rgba[i + 3] = 255;
    }
  }
}

export function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const scanline = width * 4 + 1;
  const raw = Buffer.alloc(scanline * height);
  for (let y = 0; y < height; y++) {
    raw[y * scanline] = 0;
    rgba.copy(raw, y * scanline + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", Buffer.concat([u32(width), u32(height), Buffer.from([8, 6, 0, 0, 0])])),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, "ascii");
  return Buffer.concat([u32(data.length), name, data, u32(crc32(Buffer.concat([name, data])))]);
}

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export async function copyAnsiToClipboard(text: string, env: NodeJS.ProcessEnv = process.env): Promise<ClipboardResult> {
  const png = ansiToPng(text);
  if (env.VANTA_TEST_CLIPBOARD === "1") return { ok: true, message: `rendered PNG (${png.length} bytes)`, bytes: png.length };
  try {
    await copyPngBuffer(png);
    return { ok: true, message: `copied screenshot PNG to clipboard (${png.length} bytes)`, bytes: png.length };
  } catch (err) {
    return { ok: false, message: `screenshot copy failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function copyPngBuffer(png: Buffer): Promise<void> {
  if (process.platform === "darwin") return copyMac(png);
  if (process.platform === "linux") return copyLinux(png);
  if (process.platform === "win32") return copyWindows(png);
  throw new Error(`unsupported platform ${process.platform}`);
}

async function copyMac(png: Buffer): Promise<void> {
  const file = await tempPng(png);
  try {
    await run("osascript", ["-e", `set the clipboard to (read POSIX file "${file.replace(/"/g, '\\"')}" as «class PNGf»)`]);
  } finally {
    await unlink(file).catch(() => {});
  }
}

async function copyLinux(png: Buffer): Promise<void> {
  try {
    await run("xclip", ["-selection", "clipboard", "-t", "image/png", "-i"], png);
    return;
  } catch {
    await run("xsel", ["--clipboard", "--input", "--mime-type", "image/png"], png);
  }
}

async function copyWindows(png: Buffer): Promise<void> {
  const file = await tempPng(png);
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms;",
    "Add-Type -AssemblyName System.Drawing;",
    `$img=[System.Drawing.Image]::FromFile('${file.replace(/'/g, "''")}');`,
    "[System.Windows.Forms.Clipboard]::SetImage($img);",
    "$img.Dispose();",
  ].join("");
  try {
    await run("powershell.exe", ["-STA", "-NoProfile", "-Command", script]);
  } finally {
    await unlink(file).catch(() => {});
  }
}

async function tempPng(png: Buffer): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "vanta-shot-"));
  const file = join(dir, "screenshot.png");
  await writeFile(file, png);
  return file;
}

function run(cmd: string, args: string[], input?: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "ignore", "pipe"] });
    const err: Buffer[] = [];
    child.stderr?.on("data", (d: Buffer) => err.push(d));
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${Buffer.concat(err).toString("utf8").trim()}`)));
    child.stdin?.end(input);
  });
}

const FONT: Record<string, string[]> = {
  " ": ["00000","00000","00000","00000","00000","00000","00000"],
  "?": ["01110","10001","00001","00010","00100","00000","00100"],
  "0": ["01110","10001","10011","10101","11001","10001","01110"],
  "1": ["00100","01100","00100","00100","00100","00100","01110"],
  "2": ["01110","10001","00001","00010","00100","01000","11111"],
  "3": ["11110","00001","00001","01110","00001","00001","11110"],
  "4": ["00010","00110","01010","10010","11111","00010","00010"],
  "5": ["11111","10000","11110","00001","00001","10001","01110"],
  "6": ["00110","01000","10000","11110","10001","10001","01110"],
  "7": ["11111","00001","00010","00100","01000","01000","01000"],
  "8": ["01110","10001","10001","01110","10001","10001","01110"],
  "9": ["01110","10001","10001","01111","00001","00010","01100"],
  "A": ["01110","10001","10001","11111","10001","10001","10001"],
  "B": ["11110","10001","10001","11110","10001","10001","11110"],
  "C": ["01110","10001","10000","10000","10000","10001","01110"],
  "D": ["11110","10001","10001","10001","10001","10001","11110"],
  "E": ["11111","10000","10000","11110","10000","10000","11111"],
  "F": ["11111","10000","10000","11110","10000","10000","10000"],
  "G": ["01110","10001","10000","10111","10001","10001","01110"],
  "H": ["10001","10001","10001","11111","10001","10001","10001"],
  "I": ["01110","00100","00100","00100","00100","00100","01110"],
  "J": ["00001","00001","00001","00001","10001","10001","01110"],
  "K": ["10001","10010","10100","11000","10100","10010","10001"],
  "L": ["10000","10000","10000","10000","10000","10000","11111"],
  "M": ["10001","11011","10101","10101","10001","10001","10001"],
  "N": ["10001","11001","10101","10011","10001","10001","10001"],
  "O": ["01110","10001","10001","10001","10001","10001","01110"],
  "P": ["11110","10001","10001","11110","10000","10000","10000"],
  "Q": ["01110","10001","10001","10001","10101","10010","01101"],
  "R": ["11110","10001","10001","11110","10100","10010","10001"],
  "S": ["01111","10000","10000","01110","00001","00001","11110"],
  "T": ["11111","00100","00100","00100","00100","00100","00100"],
  "U": ["10001","10001","10001","10001","10001","10001","01110"],
  "V": ["10001","10001","10001","10001","10001","01010","00100"],
  "W": ["10001","10001","10001","10101","10101","10101","01010"],
  "X": ["10001","10001","01010","00100","01010","10001","10001"],
  "Y": ["10001","10001","01010","00100","00100","00100","00100"],
  "Z": ["11111","00001","00010","00100","01000","10000","11111"],
  ".": ["00000","00000","00000","00000","00000","01100","01100"],
  ",": ["00000","00000","00000","00000","01100","01100","01000"],
  ":": ["00000","01100","01100","00000","01100","01100","00000"],
  ";": ["00000","01100","01100","00000","01100","01100","01000"],
  "!": ["00100","00100","00100","00100","00100","00000","00100"],
  "-": ["00000","00000","00000","11111","00000","00000","00000"],
  "_": ["00000","00000","00000","00000","00000","00000","11111"],
  "/": ["00001","00010","00010","00100","01000","01000","10000"],
  "\\": ["10000","01000","01000","00100","00010","00010","00001"],
  "|": ["00100","00100","00100","00100","00100","00100","00100"],
  "+": ["00000","00100","00100","11111","00100","00100","00000"],
  "=": ["00000","00000","11111","00000","11111","00000","00000"],
  "*": ["00000","10101","01110","11111","01110","10101","00000"],
  "'": ["00100","00100","01000","00000","00000","00000","00000"],
  "\"": ["01010","01010","00000","00000","00000","00000","00000"],
  "`": ["01000","00100","00000","00000","00000","00000","00000"],
  "(": ["00010","00100","01000","01000","01000","00100","00010"],
  ")": ["01000","00100","00010","00010","00010","00100","01000"],
  "[": ["01110","01000","01000","01000","01000","01000","01110"],
  "]": ["01110","00010","00010","00010","00010","00010","01110"],
  "{": ["00010","00100","00100","01000","00100","00100","00010"],
  "}": ["01000","00100","00100","00010","00100","00100","01000"],
  "<": ["00010","00100","01000","10000","01000","00100","00010"],
  ">": ["01000","00100","00010","00001","00010","00100","01000"],
  "#": ["01010","11111","01010","01010","11111","01010","00000"],
  "$": ["00100","01111","10100","01110","00101","11110","00100"],
  "%": ["11001","11010","00010","00100","01000","01011","10011"],
  "&": ["01100","10010","10100","01000","10101","10010","01101"],
  "@": ["01110","10001","10111","10101","10111","10000","01110"],
  "~": ["00000","00000","01001","10110","00000","00000","00000"],
};

function glyphFor(ch: string): string[] {
  return FONT[ch.toUpperCase()] ?? FONT["?"]!;
}
