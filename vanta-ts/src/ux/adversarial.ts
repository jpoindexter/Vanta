import { addComment, createTicket, type Ticket, type TicketDeps } from "../tickets/store.js";

export type UxObservation = {
  area: string;
  text: string;
};

export type UxFinding = {
  area: string;
  title: string;
  evidence: string;
  severity: "p1" | "p2" | "p3";
  reason: string;
};

export type UxPassResult = {
  persona: string;
  findings: UxFinding[];
  ignored: Array<{ area: string; text: string; reason: string }>;
  tickets: Ticket[];
};

const ACTIONABLE = [
  { re: /\b(can't|cannot|unable to|blocked|stuck|dead end)\b/i, reason: "blocks task completion", severity: "p1" as const },
  { re: /\b(can't find|where is|missing|hidden|buried)\b/i, reason: "important control is hard to find", severity: "p2" as const },
  { re: /\b(confusing|unclear|ambiguous|don't know what|no explanation)\b/i, reason: "copy or state is unclear", severity: "p2" as const },
  { re: /\b(no feedback|nothing happened|silent|spinner|loading forever)\b/i, reason: "system feedback is missing", severity: "p2" as const },
  { re: /\b(tiny|too small|overlap|covered|cut off|contrast|keyboard|focus|label)\b/i, reason: "accessibility or layout problem", severity: "p2" as const },
  { re: /\b(error|crash|500|404|failed|broken)\b/i, reason: "visible failure state", severity: "p1" as const },
];

const NOISE = [
  /\bi hate (apps|computers|websites|this)\b/i,
  /\bugly\b/i,
  /\bboring\b/i,
  /\bdon't like the color\b/i,
  /\btoo much reading\b/i,
];

export const CHECKOUT_FIXTURE: UxObservation[] = [
  { area: "pricing", text: "I can't find which plan includes team approvals, so I would give up before checkout." },
  { area: "checkout", text: "After I click purchase, nothing happened and there is no feedback." },
  { area: "theme", text: "I hate websites and don't like the color." },
];

export function filterUxFindings(observations: UxObservation[]): Pick<UxPassResult, "findings" | "ignored"> {
  const findings: UxFinding[] = [];
  const ignored: UxPassResult["ignored"] = [];
  for (const obs of observations) {
    const match = ACTIONABLE.find((rule) => rule.re.test(obs.text));
    const noise = NOISE.some((rule) => rule.test(obs.text));
    if (!match) {
      ignored.push({ ...obs, reason: noise ? "persona venting without an actionable UI failure" : "no concrete task, state, layout, or accessibility failure" });
      continue;
    }
    if (noise && !/\b(can't|cannot|unable|blocked|nothing happened|error|broken)\b/i.test(obs.text)) {
      ignored.push({ ...obs, reason: "persona venting without an actionable UI failure" });
      continue;
    }
    findings.push({
      area: obs.area,
      title: titleFor(obs, match.reason),
      evidence: obs.text,
      severity: match.severity,
      reason: match.reason,
    });
  }
  return { findings, ignored };
}

export async function runAdversarialUxPass(opts: {
  dataDir: string;
  observations: UxObservation[];
  persona?: string;
  deps?: TicketDeps;
}): Promise<UxPassResult> {
  const persona = opts.persona ?? "hostile novice";
  const { findings, ignored } = filterUxFindings(opts.observations);
  const deps = opts.deps ?? { now: () => new Date(), id: () => `ux-${Date.now().toString(36)}` };
  const tickets: Ticket[] = [];
  for (const finding of findings) {
    const ticket = await createTicket(opts.dataDir, {
      title: `[UX/${finding.severity}] ${finding.title}`,
      labels: ["ux", "adversarial", finding.severity, finding.area],
    }, deps);
    await addComment(opts.dataDir, ticket.id, `Persona: ${persona}\nEvidence: ${finding.evidence}\nWhy: ${finding.reason}`, deps);
    tickets.push(ticket);
  }
  return { persona, findings, ignored, tickets };
}

function titleFor(obs: UxObservation, reason: string): string {
  const text = obs.text.replace(/\s+/g, " ").trim();
  const clipped = text.length > 76 ? `${text.slice(0, 73)}...` : text;
  return `${obs.area}: ${reason} — ${clipped}`;
}
