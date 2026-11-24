/**
 * Chunks reachable from an entry through static import statements: everything the
 * process must load before the entry's first line runs. Dynamic imports are lazy.
 */
export function eagerChunks(metafile, entryName = "cli.mjs") {
  const outputs = metafile.outputs;
  const entry = Object.keys(outputs).find((key) => key.endsWith(`/${entryName}`) || key === entryName);
  if (!entry) throw new Error(`No ${entryName} output in metafile. Build the runtime bundle first.`);
  const seen = new Set();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const edge of outputs[file].imports) {
      if (edge.kind === "import-statement" && !edge.external) stack.push(edge.path);
    }
  }
  return seen;
}

/** Source inputs, external packages and bytes that the eager chunks pull in. */
export function summarizeEager(metafile, entryName = "cli.mjs") {
  const chunks = eagerChunks(metafile, entryName);
  const inputs = new Set();
  const packages = new Set();
  let bytes = 0;
  for (const chunk of chunks) {
    const output = metafile.outputs[chunk];
    bytes += output.bytes;
    for (const input of Object.keys(output.inputs)) inputs.add(input);
    for (const edge of output.imports) if (edge.external && edge.kind === "import-statement") packages.add(packageName(edge.path));
  }
  return { chunks: chunks.size, totalChunks: Object.keys(metafile.outputs).length, bytes, inputs: [...inputs].sort(), packages: [...packages].sort() };
}

export function packageName(specifier) {
  if (specifier.startsWith("node:")) return specifier;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}
