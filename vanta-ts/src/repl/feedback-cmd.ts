import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { redactSecrets, scanForSecrets } from "../store/secret-scan.js";
import { buildGhIssueArgs, type IssueDraft } from "./auto-issue.js";
import { oneLine } from "./format.js";
import type { Verdict } from "../types.js";
import type { ReplCtx, SlashHandler, SlashResult } from "./types.js";

// FEEDBACK-FEATURE-REQUEST — in-product /feedback: turn a thought into a redacted
// GitHub issue draft, show it, and file it only on explicit `/feedback send`
// (default OFF — nothing files until you confirm). The secret redactor runs
// before anything is drafted or filed, and the gh exec is kernel-gated. Extends
// BUG-CAPTURE (durable local record) with an outbound path; reuses AUTO-ISSUE's
// injection-safe `buildGhIssueArgs`. The live `gh issue create` is the documented
// boundary (needs gh authed) — same as batch.ts's gh pr create.

const exec = promisify(execFile);
const GH_TIMEOUT_MS = 30_000;
const TITLE_MAX = 100;
const BODY_MAX = 4000;
const DEFAULT_REPO = "jpoindexter/Vanta";

export type GhRunner = (args: string[], cwd: string) => Promise<{ ok: boolean; stdout: string; stderr: string }>;

const defaultGh: GhRunner = async (args, cwd) => {
  try {
    const { stdout, stderr } = await exec("gh", args, { cwd, timeout: GH_TIMEOUT_MS });
    return { ok: true, stdout, stderr };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, stdout: e.stdout ?? "", stderr: e.stderr || e.message || "gh failed" };
  }
};

const KINDS = {
  feature: { label: "enhancement", prefix: "Feature request" },
  feedback: { label: "feedback", prefix: "Feedback" },
} as const;
type Kind = keyof typeof KINDS;

/** Read the text as a feature request vs general feedback (drives the label). Pure. */
export function classifyFeedback(text: string): Kind {
  return /\b(feature|request|add|support|would love|wish|please add|could you|nice to have|it'?d be nice)\b/i.test(text)
    ? "feature"
    : "feedback";
}

export type FeedbackMeta = { provider: string; model: string };

/** Build a redacted issue draft from the user's feedback. Pure. */
export function buildFeedbackDraft(text: string, meta: FeedbackMeta, kind: Kind): IssueDraft {
  const safe = redactSecrets(text).trim();
  const k = KINDS[kind];
  const title = safe ? oneLine(`${k.prefix}: ${safe}`, TITLE_MAX) : `${k.prefix} (via Vanta)`;
  const body = [
    safe || "(no description provided)",
    "",
    "---",
    `_Filed in-product via \`/feedback\` · ${meta.provider}/${meta.model} · secrets redacted before drafting._`,
  ]
    .join("\n")
    .slice(0, BODY_MAX);
  return { title, body, labels: [k.label] };
}

type Pending = { draft: IssueDraft; repo: string };
const pendingPath = (dataDir: string, sessionId: string): string =>
  join(dataDir, "feedback", `pending-${sessionId}.json`);

export type FileResult = { ok: boolean; url?: string; message: string };

/**
 * Kernel-gate then file the issue via the injected gh runner. A `block` verdict
 * refuses; `allow`/`ask` proceed because the explicit `/feedback send` IS the
 * human confirm. The gh runner is injected so this is unit-testable.
 */
export async function fileFeedbackIssue(
  pending: Pending,
  deps: { safety: { assess(action: string): Promise<Verdict> }; repoRoot: string; gh: GhRunner },
): Promise<FileResult> {
  const verdict = await deps.safety.assess(`gh issue create --repo ${pending.repo} (file a GitHub issue)`);
  if (verdict.risk === "block") return { ok: false, message: `blocked by kernel: ${verdict.reason || "filing refused"}` };
  const r = await deps.gh(buildGhIssueArgs(pending.draft, pending.repo), deps.repoRoot);
  if (!r.ok) return { ok: false, message: `gh failed: ${oneLine(r.stderr, 200)} (is gh authenticated? \`gh auth login\`)` };
  const url = (r.stdout.match(/https?:\/\/\S+/) ?? [])[0];
  return { ok: true, url, message: url ? `filed → ${url}` : "filed (no URL returned)" };
}

/** Render a drafted issue for review, flagging any redacted secrets. Pure. */
export function renderDraft(d: IssueDraft, secretsFound: string[]): string {
  const note = secretsFound.length ? `\n  ⚠ redacted secrets before drafting: ${secretsFound.join(", ")}` : "";
  return [
    `  📣 Draft issue (${d.labels.join(", ")}):`,
    `  ${d.title}`,
    "",
    ...d.body.split("\n").map((l) => `  │ ${l}`),
    note,
    "",
    "  Review it, then `/feedback send` to file it to GitHub. Nothing is filed until you do.",
  ].join("\n");
}

/** Build the /feedback handler with an injectable gh runner (DI for tests). */
export function makeFeedbackHandler(gh: GhRunner = defaultGh): SlashHandler {
  return async (arg, ctx): Promise<SlashResult> => {
    const repoRoot = dirname(ctx.dataDir);
    const repo = ctx.env.VANTA_FEEDBACK_REPO ?? DEFAULT_REPO;
    const pfile = pendingPath(ctx.dataDir, ctx.state.sessionId);
    const text = arg.trim();

    if (text === "send") {
      let pending: Pending;
      try {
        pending = JSON.parse(await readFile(pfile, "utf8")) as Pending;
      } catch {
        return { output: "  no pending feedback draft — run `/feedback <your feedback>` first" };
      }
      const res = await fileFeedbackIssue(pending, { safety: ctx.setup.safety, repoRoot, gh });
      if (res.ok) await rm(pfile, { force: true });
      return { output: `  ${res.ok ? "✅" : "✗"} ${res.message}` };
    }

    if (!text)
      return { output: "  usage: /feedback <feedback or feature request>   ·   /feedback send  (files the drafted issue)" };

    const kind = classifyFeedback(text);
    const meta = { provider: ctx.env.VANTA_PROVIDER ?? "unknown", model: ctx.setup.provider.modelId() };
    const draft = buildFeedbackDraft(text, meta, kind);
    await mkdir(dirname(pfile), { recursive: true });
    await writeFile(pfile, JSON.stringify({ draft, repo } satisfies Pending), "utf8");
    return { output: renderDraft(draft, scanForSecrets(text)) };
  };
}

export const feedback = makeFeedbackHandler();
