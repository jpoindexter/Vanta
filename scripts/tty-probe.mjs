#!/usr/bin/env node
// TTY scroll probe — shows exactly what your terminal sends for trackpad/wheel
// gestures under each mouse mode. Run it, scroll during each 5s phase, read.
//   node scripts/tty-probe.mjs
// Phase 1: DECSET 1007 (alternate scroll) — expect arrow keys: 1b 5b 41 "[A"
// Phase 2: DECSET 1000;1006 (SGR tracking) — expect reports like "[<64;10;5M"

const out = process.stdout;
const phaseMs = 5000;

function show(buf) {
  const hex = [...buf].map((b) => b.toString(16).padStart(2, "0")).join(" ");
  const printable = buf.toString("latin1").replace(/\x1b/g, "ESC").replace(/[\x00-\x1a\x1c-\x1f]/g, ".");
  out.write(`  ${hex}  |${printable}|\n`);
}

function phase(label, enable, disable) {
  return new Promise((resolve) => {
    out.write(`\n── ${label} — scroll NOW (5s) ──\n`);
    out.write(enable);
    const onData = (b) => {
      if (b.toString() === "\x03") cleanupAndExit(disable); // ^C
      show(b);
    };
    process.stdin.on("data", onData);
    setTimeout(() => {
      process.stdin.off("data", onData);
      out.write(disable);
      resolve();
    }, phaseMs);
  });
}

function cleanupAndExit(disable) {
  out.write(disable + "\x1b[?1007l\x1b[?1000;1006l");
  process.stdin.setRawMode(false);
  process.exit(0);
}

if (!process.stdin.isTTY) {
  console.error("not a TTY — run directly in your terminal");
  process.exit(1);
}
process.stdin.setRawMode(true);
process.stdin.resume();
out.write("TTY probe: 2 phases × 5s. Two-finger-scroll / wheel during each.\n");
out.write("(^C to abort. Plain keys also echo — that's fine.)\n");

await phase("phase 1: alternate scroll (1007)", "\x1b[?1007h", "\x1b[?1007l");
await phase("phase 2: SGR mouse tracking (1000;1006)", "\x1b[?1000;1006h", "\x1b[?1000;1006l");

out.write("\ndone — paste this output back.\n");
process.stdin.setRawMode(false);
process.exit(0);
