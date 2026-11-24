import { closeSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { disableTypes } from "image-size";

const BLOCKED_PARSERS = ["heif", "icns", "jxl", "jxl-stream"];
const BUILD_INPUT_DIRECTORIES = ["docs", "src", "static"];
const HEIF_BRANDS = new Set([
  "avif", "avis", "heic", "heis", "heix", "heim",
  "hevc", "hevs", "hevx", "hevm", "mif1", "msf1",
]);

function ascii(buffer, start, end) {
  return buffer.subarray(start, end).toString("ascii");
}

export function identifyBlockedImageType(buffer) {
  if (buffer.length >= 4 && ascii(buffer, 0, 4) === "icns") return "ICNS";
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0x0a) return "JPEG XL";
  if (
    buffer.length >= 12
    && buffer.subarray(0, 12).equals(Buffer.from([0, 0, 0, 12, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a]))
  ) return "JPEG XL";
  if (buffer.length >= 12 && ascii(buffer, 4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(buffer, 8, 12))) {
    return "HEIF/AVIF";
  }
  return null;
}

function readHeader(path) {
  const descriptor = openSync(path, "r");
  try {
    const header = Buffer.alloc(32);
    const bytesRead = readSync(descriptor, header, 0, header.length, 0);
    return header.subarray(0, bytesRead);
  } finally {
    closeSync(descriptor);
  }
}

function collectFiles(path, files) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const entryPath = resolve(path, entry.name);
    if (entry.isDirectory()) collectFiles(entryPath, files);
    else if (entry.isFile() || entry.isSymbolicLink()) files.push(entryPath);
  }
}

export function scanBuildInputs(root = process.cwd()) {
  const absoluteRoot = resolve(root);
  const files = [];
  for (const directory of BUILD_INPUT_DIRECTORIES) {
    const inputPath = resolve(absoluteRoot, directory);
    try {
      if (statSync(inputPath).isDirectory()) collectFiles(inputPath, files);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return files.flatMap((path) => {
    const type = identifyBlockedImageType(readHeader(path));
    return type ? [{ path: relative(absoluteRoot, path), type }] : [];
  });
}

export function disableUnsafeImageParsers() {
  disableTypes(BLOCKED_PARSERS);
}

export function assertSafeBuildInputs(root = process.cwd()) {
  const findings = scanBuildInputs(root);
  if (findings.length === 0) return;
  const details = findings.map(({ path, type }) => `  - ${path}: ${type}`).join("\n");
  throw new Error(
    `Unsupported documentation image formats would reach an unpatched parser:\n${details}`,
  );
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  disableUnsafeImageParsers();
  assertSafeBuildInputs();
  console.log("image-build-security: affected parsers disabled; build inputs clean");
}
