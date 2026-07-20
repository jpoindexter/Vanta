import { inflateSync } from "node:zlib";

type Raster = { width: number; height: number; channels: number; bytes: Buffer };

export function isBlankPng(buffer: Buffer): boolean {
  const raster = readRaster(buffer);
  if (!raster) return false;
  const stride = raster.width * raster.channels;
  let previous: Buffer = Buffer.alloc(stride);
  let offset = 0;
  for (let rowIndex = 0; rowIndex < raster.height; rowIndex++) {
    const filter = raster.bytes[offset++] ?? -1;
    const row = unfilterRow(raster.bytes.subarray(offset, offset + stride), previous, raster.channels, filter);
    if (!row || rowHasColor(row, raster.channels)) return false;
    previous = row;
    offset += stride;
  }
  return true;
}

function readRaster(buffer: Buffer): Raster | null {
  if (buffer.length < 33 || buffer.toString("ascii", 1, 4) !== "PNG") return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const channels = channelsFor(buffer[25]);
  if (buffer[24] !== 8 || buffer[28] !== 0 || !channels) return null;
  const chunks: Buffer[] = [];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") chunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  if (!chunks.length) return null;
  try {
    return { width, height, channels, bytes: inflateSync(Buffer.concat(chunks)) };
  } catch {
    return null;
  }
}

function channelsFor(colorType: number | undefined): number {
  if (colorType === 0) return 1;
  if (colorType === 2) return 3;
  if (colorType === 4) return 2;
  if (colorType === 6) return 4;
  return 0;
}

function unfilterRow(source: Buffer, previous: Buffer, bpp: number, filter: number): Buffer | null {
  if (filter < 0 || filter > 4) return null;
  const row = Buffer.alloc(source.length);
  for (let index = 0; index < source.length; index++) {
    const left = index >= bpp ? row[index - bpp]! : 0;
    const up = previous[index] ?? 0;
    const upperLeft = index >= bpp ? previous[index - bpp]! : 0;
    const predictor = filterPredictor(filter, left, up, upperLeft);
    row[index] = (source[index]! + predictor) & 0xff;
  }
  return row;
}

function filterPredictor(filter: number, left: number, up: number, upperLeft: number): number {
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return Math.floor((left + up) / 2);
  if (filter === 4) return paeth(left, up, upperLeft);
  return 0;
}

function paeth(left: number, up: number, upperLeft: number): number {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const diagonalDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= diagonalDistance) return left;
  return upDistance <= diagonalDistance ? up : upperLeft;
}

function rowHasColor(row: Buffer, channels: number): boolean {
  const colorChannels = channels < 3 ? 1 : 3;
  for (let pixel = 0; pixel < row.length; pixel += channels) {
    for (let channel = 0; channel < colorChannels; channel++) {
      if ((row[pixel + channel] ?? 0) > 0) return true;
    }
  }
  return false;
}
