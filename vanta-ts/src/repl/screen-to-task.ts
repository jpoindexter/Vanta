// SCREEN-TO-TASK: turn the current screen/context into one concrete action.
// Takes a screenshot description (or text excerpt) and produces a single
// next-action task. Pure — the caller decides what to do with it.

export type ScreenTask = {
  title: string;    // one concrete action ≤8 words
  why: string;      // why this is the priority given the screen
  confidence: "high" | "medium" | "low";
};

/**
 * Parse the most prominent next action from a screen description.
 * Looks for: error messages, blocked UIs, call-to-action text, stalled builds.
 * Pure — takes a text description of what's on screen.
 */
export function screenToTask(description: string): ScreenTask {
  const lower = description.toLowerCase();

  // Build/test red — check before generic error to avoid swallowing test failures
  if (/\b(test(s)? (failed|red)|build failed|failing|❌|✗)\b/.test(lower)) {
    return { title: "Fix failing tests", why: "Tests are red on screen", confidence: "high" };
  }

  // Error/failure state — highest signal
  if (/\b(error|failed|failure|exception|crash|undefined|null pointer|stack trace)\b/.test(lower)) {
    const errorLine = description.split("\n").find((l) => /error|failed/i.test(l)) ?? description.slice(0, 80);
    return {
      title: "Fix the error on screen",
      why: `Error detected: ${errorLine.trim().slice(0, 60)}`,
      confidence: "high",
    };
  }

  // PR / review needed
  if (/\b(review requested|changes requested|needs review|open pr|pull request)\b/.test(lower)) {
    return { title: "Address PR review feedback", why: "PR review is pending on screen", confidence: "high" };
  }

  // Approval waiting
  if (/\b(approve|approval|waiting for approval|pending approval)\b/.test(lower)) {
    return { title: "Handle pending approval", why: "Approval is blocked on screen", confidence: "medium" };
  }

  // Stalled / empty state
  if (/\b(nothing to show|no results|empty|getting started|welcome)\b/.test(lower)) {
    return { title: "Set up or add the first item", why: "Empty state detected on screen", confidence: "medium" };
  }

  // Default — surface the context as a review task
  return {
    title: "Review what's on screen",
    why: "No clear action detected — inspect manually",
    confidence: "low",
  };
}

/** Build a prompt that asks the vision model to describe the screen for screenToTask. */
export function buildScreenPrompt(): string {
  return "Describe what's on screen in 2-3 sentences. Focus on: error messages, test results, UI state (empty/loading/error/success), and any prominent call-to-action or blocking element. Plain text only.";
}
