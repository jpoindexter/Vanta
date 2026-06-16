import { openSync, readSync, writeSync, closeSync, constants } from "node:fs";
import { ReadStream } from "node:tty";

// Query the terminal background color via OSC 11 before the TUI starts.
// Opens /dev/tty with O_NONBLOCK (readSync → EAGAIN instead of blocking) AND
// puts it in raw mode first: cooked mode would echo the response BEL to the
// terminal (the ping) and buffer the reply until a newline that never comes
// (the text leak into the composer). Raw mode = no echo, immediate delivery.
// Must be called before Ink claims stdin (see launch.tsx pre-warm).

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

/** Run a fn with /dev/tty in raw mode, restoring cooked mode + closing after. */
function withRawTty<T>(work: (fd: number) => T, fallback: T): T {
  let fd = -1;
  let stream: ReadStream | undefined;
  try {
    fd = openSync("/dev/tty", constants.O_RDWR | constants.O_NONBLOCK);
    stream = new ReadStream(fd);
    stream.setRawMode(true); // no echo (kills the ping), immediate byte delivery
    return work(fd);
  } catch {
    return fallback;
  } finally {
    try { stream?.setRawMode(false); } catch { /**/ }
    if (fd >= 0) try { closeSync(fd); } catch { /**/ }
  }
}

/**
 * Query terminal background via OSC 11. Reads directly from a raw /dev/tty —
 * no subprocess, no bell, no text leak, no race with Node's stdin reader.
 * Result is cached; first call takes up to 100ms, subsequent calls are free.
 */
export function queryOscBackground(): "light" | "dark" | "unknown" {
  if (_cached !== undefined) return _cached;
  if (!process.stdout.isTTY || !("O_NONBLOCK" in constants)) return (_cached = "unknown");
  return (_cached = withRawTty((fd) => {
    writeSync(fd, "\x1b]11;?\x07"); // OSC 11 query (response consumed by us, never echoed)
    return lightOrDark(parseOscRgb(pollOscResponse(fd)));
  }, "unknown"));
}
