import {
  FeedbackDraftSchema,
  FeedbackReportSchema,
  type FeedbackDraft,
  type FeedbackReport,
} from "@vanta/shared/feedback";

import type { DesktopVersionInfo } from "@/global";
import { recentSupportFailures } from './support-diagnostics';

const KEY = "desktop:feedback-draft:v1";
export const blankFeedback = (): FeedbackDraft => ({
  kind: "bug",
  title: "",
  details: "",
  steps: "",
  includeFacts: false,
});

export function readFeedbackDraft(): FeedbackDraft {
  try {
    return FeedbackDraftSchema.parse(
      JSON.parse(localStorage.getItem(KEY) ?? "null"),
    );
  } catch {
    return blankFeedback();
  }
}

export function saveFeedbackDraft(draft: FeedbackDraft): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(FeedbackDraftSchema.parse(draft)));
    return true;
  } catch {
    return false;
  }
}

export function feedbackFacts(
  version: DesktopVersionInfo | null,
): FeedbackReport["facts"] {
  if (!version) return null;
  const { appVersion, platform, electronVersion, nodeVersion } = version;
  return { appVersion, platform, electronVersion, nodeVersion };
}

export function feedbackText(
  draft: FeedbackDraft,
  version: DesktopVersionInfo | null,
): string {
  const lines = [draft.title, "", draft.details, "", draft.steps];
  const facts = draft.includeFacts ? feedbackFacts(version) : null;
  if (facts) lines.push("", JSON.stringify(facts, null, 2));
  return lines.join("\n").trim();
}

/** Explicitly added to editable context; the receiver/retry contract stays unchanged. */
export function feedbackDiagnosticContext(version: DesktopVersionInfo | null): string {
  return JSON.stringify({
    diagnostics: {
      generatedAt: new Date().toISOString(),
      facts: feedbackFacts(version),
      commit: version?.commit && /^[a-f\d]{7,64}$/i.test(version.commit) ? version.commit : null,
      failures: recentSupportFailures().slice(-6)
    }
  }, null, 2);
}

export function prepareFeedback(
  draft: FeedbackDraft,
  version: DesktopVersionInfo | null,
): FeedbackReport {
  return FeedbackReportSchema.parse({
    id: crypto.randomUUID(),
    kind: draft.kind,
    title: draft.title,
    details: draft.details,
    steps: draft.steps,
    facts: draft.includeFacts ? feedbackFacts(version) : null,
  });
}
