import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { isBlankPng } from "./png-content.js";

describe("PNG content detection", () => {
  it("distinguishes an all-black capture from visible RGBA pixels", () => {
    expect(isBlankPng(rgbaPng([0, 0, 0, 255, 0, 0, 0, 255]))).toBe(true);
    expect(isBlankPng(rgbaPng([0, 0, 0, 255, 1, 0, 0, 255]))).toBe(false);
  });

  it("does not classify unsupported or malformed PNG data as blank", () => {
    expect(isBlankPng(Buffer.from("not a png"))).toBe(false);
    expect(isBlankPng(Buffer.from("89504e470d0a1a0a", "hex"))).toBe(false);
  });
});

function rgbaPng(pixels: number[]): Buffer {
  const header = Buffer.alloc(25);
  Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").copy(header);
  header.writeUInt32BE(pixels.length / 4, 16);
  header.writeUInt32BE(1, 20);
  header[24] = 8;
  return Buffer.concat([header, Buffer.from([6, 0, 0, 0, 0, 0, 0, 0]), chunk("IDAT", deflateSync(Buffer.from([0, ...pixels]))), chunk("IEND", Buffer.alloc(0))]);
}

function chunk(type: string, data: Buffer): Buffer {
  const value = Buffer.alloc(data.length + 12);
  value.writeUInt32BE(data.length, 0);
  value.write(type, 4, "ascii");
  data.copy(value, 8);
  return value;
}
