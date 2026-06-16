import { execFileSync } from "node:child_process";

// Query the terminal's background color via OSC 11 escape sequence, then
// compute relative luminance to decide light vs dark. Falls back gracefully
// when the terminal doesn't respond (tmux pass-through, dumb terminals, CI).

/** Parse OSC color response: rgb:rrrr/gggg/bbbb (16-bit) or rgb:rr/gg/bb (8-bit). */
export function parseOscRgb(raw: string): { r: number; g: number; b: number } | null {
  const m = raw.match(/rgb:([0-9a-f]+)\/([0-9a-f]+)\/([0-9a-f]+)/i);
  if (!m) return null;
  // 4-char hex = 16-bit (0xffff → 255); 2-char = 8-bit already.
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

let _cached: "light" | "dark" | "unknown" | undefined;

/**
 * Query the terminal background via OSC 11. Spawns a minimal bash one-liner
 * that writes to /dev/tty and reads back the response with a 50ms timeout.
 * Result is cached for the process lifetime (~80ms worst-case on first call).
 */
export function queryOscBackground(): "light" | "dark" | "unknown" {
  if (_cached !== undefined) return _cached;
  if (!process.stdout.isTTY) return (_cached = "unknown");
  try {
    const script = [
      "printf '\\033]11;?\\007' >/dev/tty",
      "IFS= read -r -d $'\\a' -s -t 0.05 resp </dev/tty 2>/dev/null",
      "printf '%s' \"$resp\"",
    ].join("; ");
    const raw = execFileSync("/bin/bash", ["-c", script], {
      encoding: "utf8",
      timeout: 200,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const rgb = parseOscRgb(raw);
    if (!rgb) { _cached = "unknown"; return _cached; }
    _cached = luminance(rgb) > 0.5 ? "light" : "dark";
  } catch {
    _cached = "unknown";
  }
  return _cached;
}
