import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveVantaHome } from "../store/home.js";
import {
  userSettingsPath,
  projectSettingsPath,
  localSettingsPath,
} from "../settings/store.js";

// CC-INVALID-SETTINGS-UI: when a Vanta config file fails to JSON-parse, the
// runtime keeps its best-effort silent fallback ({} → no config) so a typo in
// one file never crashes a session. But silent is the wrong default for the
// OPERATOR — `vanta status`/`doctor` should NAME the broken file, what's wrong,
// and (when locatable) the offending line, so it's fixable. This module is the
// detector: it independently re-reads + re-parses the known config files and
// returns a notice per file that fails, reusing the same `StatusReport.notices`
// channel as CC-AUTH-CONFLICT-NOTICE and CC-MODEL-DEPRECATION. Pure aside from
// the injected reader — never throws (gatherStatus's contract).

/** Reads a file's text, or returns null when absent/unreadable. Injected for testability. */
export type ReadConfigFile = (path: string) => Promise<string | null>;

const defaultReader: ReadConfigFile = (path) =>
  readFile(path, "utf8").then((t): string | null => t).catch(() => null);

/** Collapse an absolute home path to `~/...` so notices read like the user's mental model. */
function tildeCollapse(path: string): string {
  const home = homedir();
  return path.startsWith(home + "/") ? "~" + path.slice(home.length) : path;
}

/** Extract a 1-based line number from a JSON.parse error, best-effort. */
function lineFromError(raw: string, err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  // Node 22 emits "... (line N column M)" for positional syntax errors.
  const inline = msg.match(/line (\d+)/);
  if (inline) return Number(inline[1]);
  // Older Node only gives "at position N" — re-derive the line from the offset.
  const pos = msg.match(/position (\d+)/);
  if (pos) {
    const offset = Number(pos[1]);
    return raw.slice(0, offset).split("\n").length;
  }
  return null;
}

/** Reduce Node's noisy parse message to a concise reason (drop the source-snippet tail). */
function conciseReason(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // Cut Node's " in JSON at position ..." / " is not valid JSON" trailers.
  const trimmed = msg.split(/ in JSON| is not valid JSON/)[0];
  return (trimmed ?? msg).trim();
}

/**
 * One-line actionable message for a config file that failed to parse:
 * `<file>: invalid JSON at line N — <reason> — fix it or remove it`.
 * `file` is used verbatim (the caller chooses the friendly/scoped label).
 */
export function describeConfigError(file: string, raw: string, err: unknown): string {
  const line = lineFromError(raw, err);
  const where = line === null ? "invalid JSON" : `invalid JSON at line ${line}`;
  return `${file}: ${where} — ${conciseReason(err)} — fix it or remove it`;
}

/** A known config file: where it lives, plus the label shown in a notice. */
type ConfigTarget = { path: string; label: string };

/** The config files Vanta reads, paired with operator-friendly labels. */
function configTargets(env: NodeJS.ProcessEnv, cwd: string): ConfigTarget[] {
  return [
    { path: join(cwd, ".mcp.json"), label: ".mcp.json" },
    { path: join(resolveVantaHome(env), "mcp.json"), label: "~/.vanta/mcp.json" },
    { path: userSettingsPath(env), label: "~/.vanta/settings.json" },
    { path: projectSettingsPath(cwd), label: ".vanta/settings.json" },
    { path: localSettingsPath(cwd), label: ".vanta/settings.local.json" },
  ].map((t) => ({ ...t, label: tildeCollapse(t.label) }));
}

export type ValidateConfigOpts = { cwd?: string; read?: ReadConfigFile };

/**
 * Check every known config file that EXISTS; return a notice per file that fails
 * to JSON-parse. `[]` when all clean or absent. Never throws — an unreadable or
 * absent file is simply skipped (matches the runtime's best-effort fallback).
 */
export async function validateConfigFiles(
  env: NodeJS.ProcessEnv,
  opts: ValidateConfigOpts = {},
): Promise<string[]> {
  const cwd = opts.cwd ?? process.cwd();
  const read = opts.read ?? defaultReader;
  const targets = configTargets(env, cwd);

  const notices = await Promise.all(
    targets.map(async (t) => {
      let raw: string | null;
      try {
        raw = await read(t.path);
      } catch {
        return null; // read failure → treat as absent, never throw
      }
      if (!raw || !raw.trim()) return null; // absent/empty → no notice
      try {
        JSON.parse(raw);
        return null; // valid → no notice
      } catch (err) {
        return describeConfigError(t.label, raw, err);
      }
    }),
  );

  return notices.filter((n): n is string => n !== null);
}
