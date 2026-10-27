import {
  closeSync, constants, fstatSync, ftruncateSync, lstatSync, openSync,
  readSync, writeSync, type BigIntStats,
} from "node:fs";
import { dirname } from "node:path";
import { canonicalPath } from "./writable-zones.js";

type Identity = { dev: bigint; ino: bigint };
export type FileWriteTarget = {
  abs: string;
  parent: { abs: string; identity: Identity };
  previous: Buffer | null;
  stat: BigIntStats | null;
};

function changed(): never {
  throw new Error("file target or content changed while preparing the write; reload and request approval again");
}

function sameIdentity(a: Identity, b: Identity): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}

function sameVersion(a: BigIntStats, b: BigIntStats): boolean {
  return sameIdentity(a, b) && a.nlink === b.nlink && a.size === b.size
    && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

function statOrMissing(abs: string): BigIntStats | null {
  try { return lstatSync(abs, { bigint: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function existingParent(abs: string): FileWriteTarget["parent"] {
  let parent = dirname(abs);
  for (;;) {
    const identity = statOrMissing(parent);
    if (identity) {
      if (!identity.isDirectory()) changed();
      return { abs: parent, identity };
    }
    parent = dirname(parent);
  }
}

/** Positional I/O keeps source validation and readback on the same descriptor. */
function readBytes(fd: number): Buffer {
  const bytes = Buffer.alloc(Number(fstatSync(fd, { bigint: true }).size));
  let offset = 0;
  while (offset < bytes.length) {
    const count = readSync(fd, bytes, offset, bytes.length - offset, offset);
    if (!count) changed();
    offset += count;
  }
  return bytes;
}

export function assertWriteParent(target: FileWriteTarget): void {
  if (canonicalPath(target.abs) !== target.abs) changed();
  const parent = statOrMissing(target.parent.abs);
  if (!parent?.isDirectory() || !sameIdentity(parent, target.parent.identity)) changed();
}

/** Capture before any content/edit confirmation, never after accepting it. */
export function captureWriteTarget(abs: string): FileWriteTarget {
  const target: FileWriteTarget = { abs, parent: existingParent(abs), previous: null, stat: null };
  assertWriteParent(target);
  const stat = statOrMissing(abs);
  if (!stat) return target;
  if (!stat.isFile()) changed();
  const fd = openSync(abs, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (!sameVersion(stat, opened)) changed();
    target.previous = readBytes(fd);
    target.stat = opened;
    if (!sameVersion(opened, fstatSync(fd, { bigint: true }))) changed();
    return target;
  } finally { closeSync(fd); }
}

function openUnchangedTarget(target: FileWriteTarget): number {
  assertWriteParent(target);
  const current = statOrMissing(target.abs);
  if (!target.stat) {
    if (current) changed();
    return openSync(target.abs, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o666);
  }
  if (!current?.isFile() || !sameVersion(current, target.stat)) changed();
  const fd = openSync(target.abs, constants.O_RDWR | constants.O_NOFOLLOW);
  try {
    if (!sameVersion(fstatSync(fd, { bigint: true }), target.stat)) changed();
    if (!readBytes(fd).equals(target.previous!)) changed();
    assertWriteParent(target);
    const atPath = statOrMissing(target.abs);
    if (!atPath || !sameVersion(atPath, target.stat)) changed();
    return fd;
  } catch (error) { closeSync(fd); throw error; }
}

function writeBytes(fd: number, bytes: Buffer): void {
  let offset = 0;
  while (offset < bytes.length) {
    const count = writeSync(fd, bytes, offset, bytes.length - offset, offset);
    if (!count) throw new Error("file write made no progress");
    offset += count;
  }
  ftruncateSync(fd, bytes.length);
}

function verifyTarget(target: FileWriteTarget, fd: number, bytes: Buffer): boolean {
  try {
    assertWriteParent(target);
    const atPath = statOrMissing(target.abs);
    return Boolean(atPath?.isFile() && sameIdentity(atPath, fstatSync(fd, { bigint: true })) && readBytes(fd).equals(bytes));
  } catch { return false; }
}

/** No await between revalidation and mutation; O_NOFOLLOW binds the leaf inode.
 * Not a filesystem transaction: other processes can still race parent traversal,
 * create hard links or change bytes after the final check. Node has no openat/CAS
 * primitive here. New-file O_EXCL prevents overwriting a concurrently created leaf.
 */
export function commitFileWrite(target: FileWriteTarget, content: string, checkpoint: () => void): boolean {
  const bytes = Buffer.from(content, "utf8");
  const fd = openUnchangedTarget(target);
  try {
    checkpoint();
    writeBytes(fd, bytes);
    return verifyTarget(target, fd, bytes);
  } finally { closeSync(fd); }
}
