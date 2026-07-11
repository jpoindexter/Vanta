import { deflateSync } from "node:zlib";

const WIDTH = 640, HEIGHT = 360, MARGIN = 36;
type Color = [number, number, number, number];
type Rectangle = { left: number; top: number; right: number; bottom: number };
type Line = { x0: number; y0: number; x1: number; y1: number };
const COLORS: Color[] = [[37, 99, 235, 255], [5, 150, 105, 255], [220, 38, 38, 255], [217, 119, 6, 255], [124, 58, 237, 255]];

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function pixel(image: Buffer, x: number, y: number, color: Color): void {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  const offset = (y * WIDTH + x) * 4; image[offset] = color[0]; image[offset + 1] = color[1]; image[offset + 2] = color[2]; image[offset + 3] = color[3];
}

function rectangle(image: Buffer, bounds: Rectangle, color: Color): void {
  const { left, top, right, bottom } = bounds;
  for (let y = Math.max(0, top); y <= Math.min(HEIGHT - 1, bottom); y += 1) for (let x = Math.max(0, left); x <= Math.min(WIDTH - 1, right); x += 1) pixel(image, x, y, color);
}

function line(image: Buffer, points: Line, color: Color): void {
  let { x0, y0, x1, y1 } = points;
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1; let error = dx + dy;
  while (true) { rectangle(image, { left: x0 - 1, top: y0 - 1, right: x0 + 1, bottom: y0 + 1 }, color); if (x0 === x1 && y0 === y1) break; const twice = 2 * error; if (twice >= dy) { error += dy; x0 += sx; } if (twice <= dx) { error += dx; y0 += sy; } }
}

function png(image: Buffer): Buffer {
  const header = Buffer.alloc(13); header.writeUInt32BE(WIDTH, 0); header.writeUInt32BE(HEIGHT, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc((WIDTH * 4 + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) image.copy(rows, y * (WIDTH * 4 + 1) + 1, y * WIDTH * 4, (y + 1) * WIDTH * 4);
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

function normalized(series: readonly number[][]): { values: number[][]; maximum: number } {
  const finite = series.flat().filter(Number.isFinite), maximum = Math.max(...finite, 0);
  if (finite.length < 2 || maximum <= 0) throw new Error("chart source needs at least two nonnegative numeric values");
  if (finite.some((value) => value < 0)) throw new Error("chart snapshots do not support negative values");
  return { values: series.map((row) => row.map((value) => Number.isFinite(value) ? value : 0)), maximum };
}

function bars(image: Buffer, values: number[][], maximum: number): void {
  const count = Math.max(...values.map((series) => series.length)), plotWidth = WIDTH - MARGIN * 2, group = plotWidth / count;
  values.forEach((series, seriesIndex) => series.forEach((value, index) => {
    const width = Math.max(2, Math.floor(group / values.length) - 2), left = Math.floor(MARGIN + index * group + seriesIndex * (width + 2));
    const height = Math.round((value / maximum) * (HEIGHT - MARGIN * 2)); rectangle(image, { left, top: HEIGHT - MARGIN - height, right: left + width, bottom: HEIGHT - MARGIN }, COLORS[seriesIndex % COLORS.length]!);
  }));
}

function lines(image: Buffer, values: number[][], maximum: number): void {
  const count = Math.max(...values.map((series) => series.length)), step = (WIDTH - MARGIN * 2) / Math.max(1, count - 1);
  values.forEach((series, seriesIndex) => series.slice(1).forEach((value, index) => {
    const prior = series[index]!, color = COLORS[seriesIndex % COLORS.length]!;
    line(image, { x0: Math.round(MARGIN + index * step), y0: Math.round(HEIGHT - MARGIN - prior / maximum * (HEIGHT - MARGIN * 2)), x1: Math.round(MARGIN + (index + 1) * step), y1: Math.round(HEIGHT - MARGIN - value / maximum * (HEIGHT - MARGIN * 2)) }, color);
  }));
}

export function renderChartPng(type: "bar" | "line", source: readonly number[][]): Buffer {
  if (source.length < 1 || source.length > 5 || source.some((series) => series.length > 50)) throw new Error("chart supports 1-5 series and up to 50 points");
  if (type === "line" && source.some((series) => series.length < 2)) throw new Error("line chart series need at least two points");
  const { values, maximum } = normalized(source), image = Buffer.alloc(WIDTH * HEIGHT * 4, 255), axis: Color = [55, 65, 81, 255], grid: Color = [226, 232, 240, 255];
  for (let row = 0; row <= 4; row += 1) { const y = Math.round(MARGIN + row * (HEIGHT - MARGIN * 2) / 4); rectangle(image, { left: MARGIN, top: y, right: WIDTH - MARGIN, bottom: y }, grid); }
  rectangle(image, { left: MARGIN, top: MARGIN, right: MARGIN + 1, bottom: HEIGHT - MARGIN }, axis); rectangle(image, { left: MARGIN, top: HEIGHT - MARGIN, right: WIDTH - MARGIN, bottom: HEIGHT - MARGIN + 1 }, axis);
  if (type === "bar") bars(image, values, maximum); else lines(image, values, maximum);
  return png(image);
}
