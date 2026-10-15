/** Append structured file references without duplicating generated reference lines. */
export function appendAttachmentReferences(text: string, files: string[]): string {
  const existing = new Set(text.split(/\r?\n/).map((line) => line.trim()));
  const references = [...new Set(files)].map((file) => `@${file}`).filter((line) => !existing.has(line));
  return [text.trim(), ...references].filter(Boolean).join("\n");
}
