// COMMS-TRIAGE — inbox/calendar triage for hidden commitments.
// Pure module: no I/O, no tool execution. Provides the prompt template and
// a result formatter. The agent drives actual gmail_search + calendar_read calls.

export type TriageResult = {
  urgent: string[];
  commitments: string[];
  needsReply: string[];
};

/**
 * Format a triage result for display. Pure.
 * Empty categories are omitted. All empty → "nothing urgent in inbox/calendar".
 */
export function formatTriageResult(result: TriageResult): string {
  const sections: string[] = [];

  if (result.urgent.length > 0) {
    sections.push("URGENT (needs action today):");
    sections.push(...result.urgent.map((item) => `  • ${item}`));
  }

  if (result.commitments.length > 0) {
    if (sections.length > 0) sections.push("");
    sections.push("COMMITMENTS (I said I'd do this):");
    sections.push(...result.commitments.map((item) => `  • ${item}`));
  }

  if (result.needsReply.length > 0) {
    if (sections.length > 0) sections.push("");
    sections.push("NEEDS REPLY (waiting on me):");
    sections.push(...result.needsReply.map((item) => `  • ${item}`));
  }

  if (sections.length === 0) {
    return "nothing urgent in inbox/calendar";
  }

  return sections.join("\n");
}

/**
 * Build the agent prompt for a comms triage run. Pure.
 * @param calendarHours - how many hours of calendar to look ahead (default 24)
 */
export function buildTriagePrompt(calendarHours = 24): string {
  return (
    `Check my inbox (gmail_search) and calendar (calendar_read) for the next ` +
    `${calendarHours} hours. Classify: urgent (needs action today), commitments ` +
    `(I said I'd do something), needs-reply (waiting on me). Return only those three lists.`
  );
}
