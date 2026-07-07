import { createHash } from "node:crypto";

// VANTA-COMMIT-ATTRIBUTION — track the files another agent (call_agent/build_with_
// agent) edits during a session by content hash, then fold that into git commit
// co-authorship. Generated files (lockfiles, build output) are excluded so
// attribution reflects real authored changes. Pure model + trailer building.

export type EditedFile = { path: string; hash: string };
export type AttributionSnapshot = {
  sessionId: string;
  /** Agent that made the edits (e.g. the model id / "claude"). */
  agent: string;
  /** git remote URL for cross-repo attribution, when known. */
  remoteUrl?: string;
  files: EditedFile[];
};

/** Stable content hash (sha256, short) for change detection. Pure. */
export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

// Generated / non-authored paths excluded from attribution (lockfiles, build
// output, vendored deps, minified/source-map artifacts, coverage).
const GENERATED = [
  /(^|\/)node_modules\//, /(^|\/)(dist|build|out|coverage)\//, /(^|\/)\.next\//,
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock)$/,
  /\.min\.(js|css)$/, /\.map$/, /(^|\/)\.vanta\//,
];

/** True when a path is a generated/non-authored artifact (excluded). Pure. */
export function isGeneratedFile(path: string): boolean {
  const p = path.replace(/^\.\//, "");
  return GENERATED.some((re) => re.test(p));
}

/** A fresh snapshot for a session/agent. Pure. */
export function newAttribution(sessionId: string, agent: string, remoteUrl?: string): AttributionSnapshot {
  return { sessionId, agent, ...(remoteUrl ? { remoteUrl } : {}), files: [] };
}

/**
 * Record an agent edit: hash the new content and add/update the file's entry.
 * Generated files are ignored. Returns a NEW snapshot (pure — no mutation). */
export function recordEdit(snapshot: AttributionSnapshot, path: string, content: string): AttributionSnapshot {
  if (isGeneratedFile(path)) return snapshot;
  const hash = hashContent(content);
  const files = snapshot.files.filter((f) => f.path !== path).concat({ path, hash });
  return { ...snapshot, files: files.sort((a, b) => a.path.localeCompare(b.path)) };
}

/** The Co-Authored-By trailer line for an agent. Pure. */
export function coAuthoredBy(agent: string, email: string): string {
  return `Co-Authored-By: ${agent} <${email}>`;
}

const DEFAULT_EMAIL = "agent@vanta.local";

/**
 * Build the commit trailers for a snapshot: a Co-Authored-By line plus a
 * Vanta-Attribution metadata line (session + file count + remote). Empty when no
 * files were attributed. Pure. */
export function attributionTrailers(snapshot: AttributionSnapshot, email = DEFAULT_EMAIL): string[] {
  if (snapshot.files.length === 0) return [];
  const meta = `Vanta-Attribution: session=${snapshot.sessionId} files=${snapshot.files.length}` +
    (snapshot.remoteUrl ? ` remote=${snapshot.remoteUrl}` : "");
  return [coAuthoredBy(snapshot.agent, email), meta];
}

/**
 * Append trailers to a commit message, idempotently (a trailer already present
 * is not duplicated) and with a blank-line separator before the trailer block.
 * Pure. */
export function withTrailers(message: string, trailers: string[]): string {
  const missing = trailers.filter((t) => !message.includes(t));
  if (missing.length === 0) return message;
  const sep = message.endsWith("\n") ? "" : "\n";
  return `${message}${sep}\n${missing.join("\n")}`;
}
