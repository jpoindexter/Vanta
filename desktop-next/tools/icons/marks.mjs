// HTML for each icon master, derived from vanta-ts/desktop-app/build/vanta-brand-icon.svg (the one brand source).
import fs from "node:fs";

const BONE = "#F4EFE3";
const INK = "#050507";
const VIOLET = "#7C3AED";

/** The SVG's drawing (brackets, V, signal point) without its background rect, so it can sit on any plate. */
export function markShapes(svgPath, { brackets = true, color = BONE, dot = VIOLET } = {}) {
  const svg = fs.readFileSync(svgPath, "utf8");
  const pathOf = (needle) => svg.match(new RegExp(`<path[^>]*${needle}[^>]*>`))?.[0];
  const bracket = brackets ? pathOf("M10 22V10h12") : "";
  const letter = pathOf("M20 21h7l5 14");
  const point = svg.match(/<circle[^>]*>/)?.[0];
  if (!letter || !point || (brackets && !bracket)) throw new Error(`Unexpected brand SVG shape in ${svgPath}`);
  const tint = (shape) => shape.replace(/fill="#F4EFE3"/, `fill="${color}"`).replace(/stroke="#F4EFE3"/, `stroke="${color}"`);
  return `<g fill="none" stroke="${color}" stroke-linecap="square" stroke-width="3">${bracket}</g>${tint(letter)}${point.replace("#7C3AED", dot)}`;
}

const page = (size, body) =>
  `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block}</style>${body.replace("<svg", `<svg width="${size}" height="${size}"`)}`;

/** Full-bleed square: the brand SVG exactly as drawn. */
export const fullBleed = (svgPath, size = 1024) =>
  page(size, fs.readFileSync(svgPath, "utf8"));

/** macOS-style plate: a rounded square at 80.5% of the canvas holding the mark, transparent margin around it. */
export function plate(svgPath, size = 1024, { fill = INK } = {}) {
  const inset = size * 0.0977;
  const side = size - inset * 2;
  const body = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect x="${inset}" y="${inset}" width="${side}" height="${side}" rx="${side * 0.2237}" fill="${fill}"/><g transform="translate(${inset} ${inset}) scale(${side / 64})">${markShapes(svgPath)}</g></svg>`;
  return page(size, body);
}

/** A single-colour mark for template images and the Icon Composer mono layer; `inset` is the margin as a share of the canvas. */
export function glyph(svgPath, { size = 1024, color = "#000000", brackets = false, inset = 0.1 } = {}) {
  const side = size * (1 - inset * 2);
  const body = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><g transform="translate(${size * inset} ${size * inset}) scale(${side / 64})">${markShapes(svgPath, { brackets, color, dot: color })}</g></svg>`;
  return page(size, body);
}

/** The colour mark on transparent, for the Icon Composer art layer. */
export function artLayer(svgPath, size = 1024) {
  const body = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><g transform="translate(${size * 0.17} ${size * 0.17}) scale(${(size * 0.66) / 64})">${markShapes(svgPath)}</g></svg>`;
  return page(size, body);
}

/** DMG window background: ink field, corner brackets from the brand mark, an arrow between the two drop targets. */
export function dmgBackground(width, height, scale = 2) {
  const w = width * scale;
  const h = height * scale;
  const arrowY = 236 * scale;
  const body = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${INK}"/><g fill="none" stroke="${BONE}" stroke-opacity=".55" stroke-width="${2 * scale}" stroke-linecap="square"><path d="M${20 * scale} ${44 * scale}V${20 * scale}h${24 * scale}M${w - 44 * scale} ${20 * scale}h${24 * scale}v${24 * scale}M${w - 20 * scale} ${h - 44 * scale}v${24 * scale}h-${24 * scale}M${44 * scale} ${h - 20 * scale}h-${24 * scale}v-${24 * scale}"/><path d="M${340 * scale} ${arrowY}h${70 * scale}m-${12 * scale} -${10 * scale}l${12 * scale} ${10 * scale}l-${12 * scale} ${10 * scale}" stroke="${BONE}" stroke-opacity="1"/></g><circle cx="${w - 44 * scale}" cy="${44 * scale}" r="${3 * scale}" fill="${VIOLET}"/><text x="${w / 2}" y="${h - 40 * scale}" text-anchor="middle" font-family="-apple-system,Helvetica,Arial,sans-serif" font-size="${12 * scale}" fill="${BONE}" fill-opacity=".7">Drag Vanta Next into Applications</text></svg>`;
  return `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block}</style>${body.replace("<svg", `<svg width="${w}" height="${h}"`)}`;
}
