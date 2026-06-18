import { readFileSync } from "node:fs";
import { z } from "zod";
import { MemCategorySchema, type MemoryRecord, type PublicMemCase, type PublicMemSkipped } from "./types.js";

const TurnSchema = z.object({
  role: z.string().optional(),
  speaker: z.string().optional(),
  content: z.string().optional(),
  text: z.string().optional(),
  dia_id: z.union([z.string(), z.number()]).optional(),
});

const LongMemItemSchema = z.object({
  question_id: z.string(),
  question_type: z.string(),
  question: z.string(),
  haystack_session_ids: z.array(z.union([z.string(), z.number()])),
  haystack_dates: z.array(z.string()).optional(),
  haystack_sessions: z.array(z.array(TurnSchema)),
  answer_session_ids: z.array(z.union([z.string(), z.number()])).optional(),
});

const QaSchema = z.object({
  question: z.string(),
  answer: z.unknown().optional(),
  category: z.union([z.string(), z.number()]).optional(),
  evidence: z.array(z.union([z.string(), z.number()])).optional(),
});

const LocomoSampleSchema = z.object({
  sample_id: z.union([z.string(), z.number()]),
  conversation: z.record(z.unknown()),
  qa: z.array(QaSchema),
});

function json(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function day(raw: string | undefined, fallback = "1970-01-01"): string {
  const m = raw?.match(/\d{4}-\d{2}-\d{2}/);
  return m?.[0] ?? fallback;
}

function textOf(turn: z.infer<typeof TurnSchema>): string {
  const who = turn.role ?? turn.speaker ?? "speaker";
  return `${who}: ${turn.content ?? turn.text ?? ""}`.trim();
}

function longCategory(type: string, id: string) {
  if (id.endsWith("_abs")) return "abstention";
  if (type.includes("temporal")) return "temporal";
  if (type.includes("knowledge")) return "knowledge-update";
  if (type.includes("preference")) return "preference";
  if (type.includes("multi")) return "multi-session";
  return "information-extraction";
}

const LOCOMO_NUMERIC_CATEGORIES = new Map<number, z.infer<typeof MemCategorySchema>>([
  [2, "temporal"],
  [3, "multi-session"],
  [4, "world-knowledge"],
  [5, "adversarial"],
]);

const LOCOMO_TEXT_CATEGORIES: Array<[string, z.infer<typeof MemCategorySchema>]> = [
  ["temporal", "temporal"],
  ["multi", "multi-session"],
  ["adversarial", "adversarial"],
  ["common", "world-knowledge"],
  ["world", "world-knowledge"],
];

function locomoCategory(raw: string | number | undefined) {
  if (typeof raw === "number") {
    return LOCOMO_NUMERIC_CATEGORIES.get(raw) ?? "information-extraction";
  }
  const c = raw?.toLowerCase() ?? "";
  const match = LOCOMO_TEXT_CATEGORIES.find(([needle]) => c.includes(needle));
  return match?.[1] ?? "information-extraction";
}

export function loadLongMemEval(path: string): { cases: PublicMemCase[]; skipped: PublicMemSkipped[] } {
  const items = z.array(LongMemItemSchema).parse(json(path));
  const skipped: PublicMemSkipped[] = [];
  const cases: PublicMemCase[] = [];
  for (const item of items) {
    const goldRaw = item.answer_session_ids ?? [];
    if (!goldRaw.length) {
      skipped.push({ dataset: "longmemeval", id: item.question_id, reason: "no deterministic answer_session_ids" });
      continue;
    }
    const records = item.haystack_sessions.map((session, i): MemoryRecord => {
      const sid = String(item.haystack_session_ids[i] ?? i);
      return {
        id: `${item.question_id}:session:${sid}`,
        session: i + 1,
        at: day(item.haystack_dates?.[i]),
        text: session.map(textOf).join("\n"),
      };
    });
    const gold = goldRaw.map((id) => `${item.question_id}:session:${String(id)}`);
    const category = MemCategorySchema.parse(longCategory(item.question_type, item.question_id));
    cases.push({
      dataset: "longmemeval",
      id: item.question_id,
      records,
      question: { id: item.question_id, query: item.question, category, gold },
    });
  }
  return { cases, skipped };
}

function locomoRecords(sampleId: string, conversation: Record<string, unknown>): MemoryRecord[] {
  return Object.entries(conversation).flatMap(([key, raw]) => {
    const sessionMatch = key.match(/^session_(\d+)$/);
    if (!sessionMatch) return [];
    const turns = z.array(TurnSchema).safeParse(raw);
    if (!turns.success) return [];
    const date = day(String(conversation[`${key}_date_time`] ?? ""));
    return turns.data.map((turn, j): MemoryRecord => ({
      id: `${sampleId}:dialog:${String(turn.dia_id ?? `${sessionMatch[1]}-${j}`)}`,
      session: Number(sessionMatch[1]),
      at: date,
      text: textOf(turn),
    }));
  });
}

export function loadLoCoMo(path: string): { cases: PublicMemCase[]; skipped: PublicMemSkipped[] } {
  const samples = z.array(LocomoSampleSchema).parse(json(path));
  const skipped: PublicMemSkipped[] = [];
  const cases: PublicMemCase[] = [];
  for (const sample of samples) {
    const sampleId = String(sample.sample_id);
    const records = locomoRecords(sampleId, sample.conversation);
    for (let i = 0; i < sample.qa.length; i++) {
      const qa = sample.qa[i]!;
      const id = `${sampleId}:qa:${i + 1}`;
      if (!qa.evidence?.length) {
        skipped.push({ dataset: "locomo", id, reason: "no deterministic evidence dialog ids" });
        continue;
      }
      const gold = qa.evidence.map((e) => `${sampleId}:dialog:${String(e)}`);
      const category = MemCategorySchema.parse(locomoCategory(qa.category));
      cases.push({ dataset: "locomo", id, records, question: { id, query: qa.question, category, gold } });
    }
  }
  return { cases, skipped };
}
