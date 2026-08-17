const MAX_INPUT_BYTES = 50 * 1024 * 1024;

async function readInput() {
  const chunks = [];
  let total = 0;
  for await (const raw of process.stdin) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    total += chunk.byteLength;
    if (total > MAX_INPUT_BYTES) throw codedError("resourceLimit", "document input exceeded its safety limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}

function safeFailure(error) {
  const allowed = new Set(["unsupported", "malformed", "encrypted", "resourceLimit", "missingPart", "io"]);
  const code = allowed.has(error?.code) ? error.code : "malformed";
  const message = typeof error?.message === "string"
    ? error.message.replace(/[\r\n]+/g, " ").slice(0, 500)
    : "local document conversion failed";
  return { code, message };
}

async function main() {
  const extension = process.argv[2] ?? "";
  const anydoc = await import("@firecrawl/anydoc");
  const format = anydoc.formatFromExtension(extension);
  if (!format) throw codedError("unsupported", `unsupported document extension: ${extension || "(none)"}`);
  const markdown = await anydoc.toMarkdownBytes(await readInput(), format);
  process.stdout.write(markdown);
}

main().catch((error) => {
  process.stderr.write(JSON.stringify(safeFailure(error)));
  process.exitCode = 1;
});
