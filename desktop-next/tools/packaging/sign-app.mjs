// Ad-hoc signing for a local, unsigned-identity build. No Developer ID, no hardened runtime, no timestamp.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const MACHO_MAGIC = new Set([0xfeedface, 0xcefaedfe, 0xfeedfacf, 0xcffaedfe, 0xcafebabe, 0xbebafeca]);

function isMachO(file) {
  const fd = fs.openSync(file, "r");
  try {
    const head = Buffer.alloc(4);
    return fs.readSync(fd, head, 0, 4, 0) === 4 && MACHO_MAGIC.has(head.readUInt32BE(0));
  } finally {
    fs.closeSync(fd);
  }
}

function* walkFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(full);
    else if (entry.isFile()) yield full;
  }
}

const codesign = (...args) => execFileSync("codesign", args, { stdio: ["ignore", "pipe", "pipe"] });

/** Every loose Mach-O (native addons, helper executables, the kernel) under a folder the app signature will not reach by itself. */
export function looseExecutables(dir) {
  return [...walkFiles(dir)].filter((file) => isMachO(file));
}

/** Ad-hoc signs loose Mach-O files first, then seals the whole bundle. Returns how many loose files were signed. */
export function signAdHoc({ app, looseDirs }) {
  execFileSync("xattr", ["-cr", app]);
  let signed = 0;
  for (const dir of looseDirs) {
    for (const file of looseExecutables(dir)) {
      codesign("--force", "--sign", "-", file);
      signed += 1;
    }
  }
  codesign("--force", "--deep", "--sign", "-", app);
  codesign("--verify", "--deep", "--strict", app);
  return { looseSigned: signed };
}
