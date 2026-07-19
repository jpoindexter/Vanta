import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SECRET_KEY = /(authorization|api[-_]?key|client[-_]?secret|password|token|cookie)/i;
const SECRET_VALUE = /\b(?:sk-[A-Za-z0-9_-]{8,}|\d{6,}:[A-Za-z0-9_-]{20,}|bearer\s+[A-Za-z0-9._~-]{8,})\b/gi;

export class LiveProofMismatchError extends Error {
  constructor(failures, evidence) {
    super(`Desktop live proof mismatch: ${failures.join("; ")}`);
    this.name = "LiveProofMismatchError";
    this.failures = failures;
    this.evidence = evidence;
  }
}

export function assertLiveProof(evidence, marker) {
  const failures = [];
  const rawText = evidence.rawResponse?.finalText ?? "";
  const persistedText = evidence.persistedSession?.messages?.map((message) => message.content ?? "").join("\n") ?? "";
  const renderedText = evidence.renderedText ?? "";
  if (rawText !== marker) failures.push(`raw response expected exact marker, received ${JSON.stringify(rawText)}`);
  if (!persistedText.includes(marker)) failures.push("persisted session does not contain marker");
  if (!renderedText.includes(marker)) failures.push("rendered DOM does not contain marker");
  if (!evidence.status?.provider) failures.push("provider is missing from status");
  if (!evidence.status?.model) failures.push("model is missing from status");
  if (evidence.status?.root !== evidence.projectRoot) failures.push(`project root mismatch: ${evidence.status?.root ?? "missing"}`);
  if (evidence.approvalState === undefined) failures.push("approval state was not observed");
  if (failures.length) throw new LiveProofMismatchError(failures, evidence);
  return true;
}

export function redactDiagnosticValue(value, key = "") {
  if (SECRET_KEY.test(key)) return "[REDACTED]";
  if (typeof value === "string") return value.replace(SECRET_VALUE, "[REDACTED]");
  if (Array.isArray(value)) return value.map((item) => redactDiagnosticValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactDiagnosticValue(entryValue, entryKey)]));
  }
  return value;
}

export async function writeDiagnosticBundle({ artifactRoot, label, evidence, error, screenshot }) {
  const directory = join(artifactRoot, label);
  await mkdir(directory, { recursive: true });
  const screenshotPath = join(directory, "desktop.png");
  const bundlePath = join(directory, "diagnostics.json");
  await screenshot(screenshotPath);
  const bundle = redactDiagnosticValue({
    capturedAt: new Date().toISOString(),
    error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) },
    evidence,
    screenshotPath,
  });
  await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  return { directory, screenshotPath, bundlePath };
}
