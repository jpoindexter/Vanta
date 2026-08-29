import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { imageSize } from "image-size";

import {
  disableUnsafeImageParsers,
  identifyBlockedImageType,
  scanBuildInputs,
} from "./image-build-security.mjs";

const JXL_CONTAINER = Buffer.from([
  0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20,
  0x0d, 0x0a, 0x87, 0x0a,
]);
const JXL_DETECTABLE_CONTAINER = Buffer.concat([
  JXL_CONTAINER,
  Buffer.from([0x00, 0x00, 0x00, 0x0c, 0x66, 0x74, 0x79, 0x70, 0x6a, 0x78, 0x6c, 0x20]),
]);
const HEIF_CONTAINER = Buffer.from([
  0x00, 0x00, 0x00, 0x10, 0x66, 0x74, 0x79, 0x70,
  0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00,
]);

test("identifies affected image formats by bytes, not file extension", () => {
  assert.equal(identifyBlockedImageType(Buffer.from("icns0000")), "ICNS");
  assert.equal(identifyBlockedImageType(Buffer.from([0xff, 0x0a])), "JPEG XL");
  assert.equal(identifyBlockedImageType(JXL_CONTAINER), "JPEG XL");
  assert.equal(
    identifyBlockedImageType(HEIF_CONTAINER),
    "HEIF/AVIF",
  );
  assert.equal(identifyBlockedImageType(Buffer.from("\x89PNG\r\n\x1a\n")), null);
});

test("rejects a disguised affected image before the documentation build", () => {
  const root = mkdtempSync(join(tmpdir(), "vanta-image-build-security-"));
  try {
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "docs", "safe.png"), Buffer.from("\x89PNG\r\n\x1a\n"));
    writeFileSync(join(root, "docs", "disguised.png"), Buffer.from("icns0000"));

    assert.deepEqual(scanBuildInputs(root), [
      { path: "docs/disguised.png", type: "ICNS" },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("disables affected image-size parser calculations", () => {
  disableUnsafeImageParsers();

  assert.throws(() => imageSize(Buffer.from("icns0000")), /disabled file type: icns/);
  assert.throws(() => imageSize(Buffer.from([0xff, 0x0a])), /disabled file type: jxl-stream/);
  assert.throws(() => imageSize(JXL_DETECTABLE_CONTAINER), /disabled file type: jxl/);
  assert.throws(() => imageSize(HEIF_CONTAINER), /disabled file type: heif/);
});
