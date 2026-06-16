import { openSync, readSync, writeSync, closeSync, constants } from "node:fs";

// Query the terminal background color via OSC 11 before the TUI starts.
// Opens /dev/tty with O_NONBLOCK so readSync returns EAGAIN instead of
// blocking, then polls until the response arrives or the 100ms deadline
// passes. Must be called before Ink touches stdin (see launch.tsx pre-warm).

/** Parse OSC color response: rgb:rrrr/gggg/bbbb (16-bit) or rgb:rr/gg/bb (8-bit). */
export function parseOscRgb(raw: string): { r: number; g: number; b: number } | null {
  const m = raw.match(/rgb:([0-9a-f]+)\/([0-9a-f]+)\/([0-9a-f]+)/i);
  if (!m) return null;
  const norm = (s: string): number => Math.round(parseInt(s, 16) / (s.length === 4 ? 257 : 1));
  return { r: norm(m[1]!), g: norm(m[2]!), b: norm(m[3]!) };
}

function linearize(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance per WCAG (0 = black, 1 = white). */
export function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function lightOrDark(rgb: { r: number; g: number; b: number } | null): "light" | "dark" | "unknown" {
  if (!rgb) return "unknown";
  return luminance(rgb) > 0.5 ? "light" : "dark";
}

/** Poll fd for an OSC response (BEL or ST terminated) for up to 100ms. */
function pollOscResponse(fd: number): string {
  const deadline = Date.now() + 100;
  const buf = Buffer.alloc(1);
  const bytes: number[] = [];
  while (Date.now() < deadline) {
    let n = 0;
    try { n = readSync(fd, buf, 0, 1, null); } catch { /* EAGAIN — no data yet */ }
    if (n > 0) {
      const b = buf[0]!;
      bytes.push(b);
      if (b === 0x07) break; // BEL terminator
      if (bytes.length >= 2 && bytes[bytes.length - 2] === 0x1b && b === 0x5c) break; // ST
    }
  }
  return Buffer.from(bytes).toString("latin1");
}

let _cached: "light" | "dark" | "unknown" | undefined;

/**
 * Query terminal background via OSC 11. Reads directly from /dev/tty with
 * O_NONBLOCK — no subprocess, no bell, no race with Node's stdin reader.
 * Uses ST terminator (ESC \) so unsupported terminals stay silent.
 * Result is cached; first call takes up to 100ms, subsequent calls are free.
 */
export function queryOscBackground(): "light" | "dark" | "unknown" {
  if (_cached !== undefined) return _cached;
  if (!process.stdout.isTTY || !("O_NONBLOCK" in constants)) return (_cached = "unknown");
  let fd = -1;
  try {
    fd = openSync("/dev/tty", constants.O_RDWR | constants.O_NONBLOCK);
    writeSync(fd, "\x1b]11;?\x1b\\"); // OSC 11 query, ST-terminated (no BEL)
    _cached = lightOrDark(parseOscRgb(pollOscResponse(fd)));
  } catch {
    _cached = "unknown";
  } finally {
    if (fd >= 0) try { closeSync(fd); } catch { /**/ }
  }
  return _cached;
}
