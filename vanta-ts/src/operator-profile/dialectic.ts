import { z } from "zod";
import { serializeForNotes } from "../memory/session-memory.js";
import { classifyMemory } from "../memory/relevance.js";
import type { LLMProvider } from "../providers/interface.js";
import type { Message } from "../types.js";
import {
  BeliefFacetSchema,
  activeBeliefs,
  addBeliefToStore,
  evidence,
  loadBeliefStore,
  rejectBeliefInStore,
  reviseBeliefInStore,
  saveBeliefStore,
  supportBeliefInStore,
  type BeliefEvidence,
  type BeliefFacet,
  type BeliefStore,
  type OperatorBelief,
} from "./beliefs.js";

const DEFAULT_EVERY = 8;
const MAX_UPDATES = 4;
const MAX_TRANSCRIPT_CHARS = 6000;

const UpdateSchema = z.object({
  operation: z.enum(["form", "support", "revise", "reject"]),
  belief_id: z.string().optional(),
  statement: z.string().min(4).max(240).optional(),
  facet: BeliefFacetSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  evidence_quote: z.string().min(1).max(240),
});
const UpdatesSchema = z.array(UpdateSchema).max(MAX_UPDATES);
type DialecticUpdate = z.infer<typeof UpdateSchema>;

export type DialecticResult = { ran: boolean; changed: OperatorBelief[]; reason: string };

const SYSTEM = `You maintain Vanta's explicit theory of its operator.
Compare the recent dialogue against the current beliefs. Form only durable preferences, goals, or working-style patterns. Support an existing belief when evidence agrees. Revise or reject one only when the USER directly corrects it. Do not infer feelings, diagnoses, secrets, or transient task state.

Return ONLY a JSON array of at most ${MAX_UPDATES} objects:
{"operation":"form|support|revise|reject","belief_id":"existing id when needed","statement":"required for form/revise","facet":"communication|workflow|autonomy|risk|goals|preferences|relationship","confidence":0.0,"evidence_quote":"exact short quote from the USER"}
Return [] when the dialogue adds no durable evidence.`;

export function shouldRunDialectic(turnIndex: number, userText: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (/^(0|false|off|no)$/i.test(env.VANTA_DIALECTIC ?? "")) return false;
  const classification = classifyMemory(userText);
  if (classification.class === "sensitive") return false;
  if (["durable-preference", "durable-constraint", "correction"].includes(classification.class)) return true;
  const every = positiveInt(env.VANTA_DIALECTIC_EVERY, DEFAULT_EVERY);
  return turnIndex > 0 && turnIndex % every === 0;
}

export function parseDialecticUpdates(text: string): DialecticUpdate[] {
  try {
    const raw: unknown = JSON.parse(stripFence(text));
    const parsed = UpdatesSchema.safeParse(raw);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function runDialecticPass(opts: {
  provider: LLMProvider;
  transcript: Message[];
  sessionId: string;
  turnIndex: number;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}): Promise<DialecticResult> {
  const env = opts.env ?? process.env;
  const lastUser = lastUserText(opts.transcript);
  if (!shouldRunDialectic(opts.turnIndex, lastUser, env)) return { ran: false, changed: [], reason: "gate" };
  const store = await loadBeliefStore(env);
  const changed = captureDirectSelfReport(store, lastUser, opts);
  if (changed.length) {
    await saveBeliefStore(store, env);
    return { ran: true, changed, reason: "self-report" };
  }
  try {
    const updates = await askForUpdates(opts.provider, opts.transcript, store);
    const applied = applyDialecticUpdates(store, updates, {
      userText: lastUser,
      sourceRef: `session:${opts.sessionId}:turn:${opts.turnIndex}`,
      now: opts.now ?? new Date(),
    });
    if (applied.length) await saveBeliefStore(store, env);
    return { ran: true, changed: applied, reason: updates.length ? "dialectic" : "no-update" };
  } catch {
    return { ran: true, changed: [], reason: "failed" };
  }
}

export function applyDialecticUpdates(
  store: BeliefStore,
  updates: DialecticUpdate[],
  context: { userText: string; sourceRef: string; now: Date },
): OperatorBelief[] {
  const changed: OperatorBelief[] = [];
  const authority = directAuthority(context.userText);
  for (const update of updates) {
    if (!quoteComesFromUser(update.evidence_quote, context.userText)) continue;
    const proof = updateEvidence(update, context, authority);
    const belief = applyUpdate(store, update, { proof, authority, now: context.now });
    if (belief) changed.push(belief);
  }
  return changed;
}

async function askForUpdates(provider: LLMProvider, transcript: Message[], store: BeliefStore): Promise<DialecticUpdate[]> {
  const current = activeBeliefs(store).map((belief) => ({
    id: belief.id,
    statement: belief.statement,
    facet: belief.facet,
    status: belief.status,
    confidence: belief.confidence,
  }));
  const dialogue = serializeForNotes(transcript, MAX_TRANSCRIPT_CHARS);
  const { text } = await provider.complete([
    { role: "system", content: SYSTEM },
    { role: "user", content: `Current beliefs:\n${JSON.stringify(current)}\n\nRecent dialogue:\n${dialogue}` },
  ], [], { temperature: 0, maxTokens: 700 });
  return parseDialecticUpdates(text);
}

function captureDirectSelfReport(
  store: BeliefStore,
  userText: string,
  opts: { sessionId: string; turnIndex: number; now?: Date },
): OperatorBelief[] {
  const classification = classifyMemory(userText).class;
  if (classification !== "durable-preference" && classification !== "durable-constraint") return [];
  const now = opts.now ?? new Date();
  return [addBeliefToStore(store, {
    statement: userText,
    facet: facetFromText(userText),
    status: "accepted",
    confidence: 1,
    evidence: evidence({ kind: "self_report", sourceRef: `session:${opts.sessionId}:turn:${opts.turnIndex}`, excerpt: userText }, now),
  }, { now })];
}

function applyUpdate(
  store: BeliefStore,
  update: DialecticUpdate,
  context: { proof: BeliefEvidence; authority: "correction" | "self_report" | "observation"; now: Date },
): OperatorBelief | null {
  if (update.operation === "form") return formUpdate(store, update, context);
  const current = store.beliefs.find((belief) => belief.id === update.belief_id);
  if (!current) return null;
  if (update.operation === "support") {
    return supportBeliefInStore(store, current.id, { evidence: context.proof, confidence: update.confidence ?? current.confidence }, { now: context.now });
  }
  return reviseOrReject(store, current, update, context);
}

function formUpdate(
  store: BeliefStore,
  update: DialecticUpdate,
  context: { proof: BeliefEvidence; authority: "correction" | "self_report" | "observation"; now: Date },
): OperatorBelief | null {
  if (!update.statement || !update.facet) return null;
  const accepted = context.authority === "self_report";
  return addBeliefToStore(store, {
    statement: update.statement,
    facet: update.facet,
    status: accepted ? "accepted" : "hypothesis",
    confidence: accepted ? 1 : Math.min(0.75, update.confidence ?? 0.55),
    evidence: context.proof,
  }, { now: context.now });
}

function reviseOrReject(
  store: BeliefStore,
  current: OperatorBelief,
  update: DialecticUpdate,
  context: { proof: BeliefEvidence; authority: "correction" | "self_report" | "observation"; now: Date },
): OperatorBelief | null {
  if (current.status === "accepted" && context.authority !== "correction") return null;
  if (update.operation === "reject") return rejectBeliefInStore(store, current.id, context.proof, { now: context.now });
  if (update.operation === "revise" && update.statement) {
    return reviseBeliefInStore(store, current.id, {
      statement: update.statement,
      facet: update.facet,
      status: context.authority === "correction" ? "accepted" : "hypothesis",
      confidence: context.authority === "correction" ? 1 : Math.min(0.75, update.confidence ?? 0.55),
      evidence: context.proof,
    }, { now: context.now });
  }
  return null;
}

function updateEvidence(
  update: DialecticUpdate,
  context: { sourceRef: string; now: Date },
  authority: "correction" | "self_report" | "observation",
): BeliefEvidence {
  const kind = authority === "observation" ? "dialectic" : authority;
  return evidence({ kind, sourceRef: context.sourceRef, excerpt: update.evidence_quote }, context.now);
}

function directAuthority(text: string): "correction" | "self_report" | "observation" {
  const classification = classifyMemory(text).class;
  if (classification === "correction" || classification === "durable-constraint") return "correction";
  if (classification === "durable-preference") return "self_report";
  return "observation";
}

function facetFromText(text: string): BeliefFacet {
  if (/\b(concise|brief|detailed|response|answer|tone|status update)\b/i.test(text)) return "communication";
  if (/\b(ask|approval|permission|autonomy|proactive)\b/i.test(text)) return "autonomy";
  if (/\b(risk|safe|conservative|aggressive)\b/i.test(text)) return "risk";
  if (/\b(goal|objective|trying to|working toward)\b/i.test(text)) return "goals";
  if (/\b(step|task|choice|option|workflow|plan)\b/i.test(text)) return "workflow";
  return "preferences";
}

function quoteComesFromUser(quote: string, userText: string): boolean {
  const needle = quote.toLowerCase().replace(/\s+/g, " ").trim();
  const haystack = userText.toLowerCase().replace(/\s+/g, " ");
  return needle.length >= 8 && (needle.match(/[a-z0-9']+/g)?.length ?? 0) >= 2 && haystack.includes(needle);
}

function lastUserText(transcript: Message[]): string {
  const message = [...transcript].reverse().find((item) => item.role === "user");
  return typeof message?.content === "string" ? message.content : "";
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function stripFence(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}
