import { z } from "zod";

/**
 * Raw DOM descriptor returned by page.$$eval() — the shape the browser
 * context serialises back to Node. Keep primitive-only so it survives the
 * serialisation boundary.
 */
export const RawElementSchema = z.object({
  tag: z.string(),
  text: z.string().optional(),
  role: z.string().optional(),
  name: z.string().optional(),
  type: z.string().optional(),
  selectorHint: z.string().optional(),
});

export type RawElement = z.infer<typeof RawElementSchema>;

/** A compact, agent-ready descriptor of one interactable target. */
export type PageElement = {
  index: number;
  label: string;
  selector: string;
  kind: "link" | "button" | "input" | "other";
};

const INTERACTABLE_TAGS = new Set(["a", "button", "input", "select", "textarea"]);
const MAX_ELEMENTS = 50;

function isInteractable(raw: RawElement): boolean {
  const tag = raw.tag.toLowerCase();
  if (INTERACTABLE_TAGS.has(tag)) return true;
  if (raw.role) {
    const r = raw.role.toLowerCase();
    return r === "link" || r === "button" || r === "textbox" || r === "combobox";
  }
  return false;
}

function labelFor(raw: RawElement): string {
  const candidates = [raw.name, raw.text, raw.type].filter(Boolean) as string[];
  return candidates[0]?.trim() ?? raw.tag;
}

function selectorForTextual(tag: string, label: string): string | null {
  if ((tag === "a" || tag === "button") && label) return `text=${label}`;
  return null;
}

function selectorForFormField(tag: string, raw: RawElement): string | null {
  if (tag !== "input" && tag !== "textarea" && tag !== "select") return null;
  if (raw.name) return `[name="${raw.name}"]`;
  if (raw.type) return `${tag}[type="${raw.type}"]`;
  return tag;
}

function selectorFor(raw: RawElement): string {
  const tag = raw.tag.toLowerCase();
  const label = (raw.name ?? raw.text ?? "").trim();
  return (
    selectorForTextual(tag, label) ??
    selectorForFormField(tag, raw) ??
    (raw.role ? `[role="${raw.role}"]` : null) ??
    raw.selectorHint ??
    tag
  );
}

function kindFor(raw: RawElement): PageElement["kind"] {
  const tag = raw.tag.toLowerCase();
  const role = (raw.role ?? "").toLowerCase();
  if (tag === "a" || role === "link") return "link";
  if (tag === "button" || role === "button") return "button";
  if (tag === "input" || tag === "select" || tag === "textarea" || role === "textbox") {
    return "input";
  }
  return "other";
}

function dedupeKey(el: PageElement): string {
  return `${el.kind}:${el.selector}`;
}

/**
 * Take raw DOM descriptors from page.$$eval() and produce a compact, deduped,
 * ranked list of interactable targets capped at MAX_ELEMENTS. Pure and
 * deterministic — no side effects.
 */
export function summarizeElements(raw: RawElement[]): PageElement[] {
  const seen = new Set<string>();
  const out: PageElement[] = [];

  for (const r of raw) {
    if (!isInteractable(r)) continue;
    const label = labelFor(r);
    if (!label || label === r.tag) continue; // drop unlabelled noise

    const selector = selectorFor(r);
    const kind = kindFor(r);
    const key = dedupeKey({ index: 0, label, selector, kind });

    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ index: out.length + 1, label, selector, kind });
    if (out.length >= MAX_ELEMENTS) break;
  }

  return out;
}

/**
 * Format a PageElement list as a numbered, human/agent-readable string.
 * Pure — safe to call in tests without a live page.
 */
export function formatElements(elements: PageElement[]): string {
  if (elements.length === 0) return "(no interactable elements found)";
  return elements
    .map((el) => `  ${el.index}. [${el.kind}] ${el.label} — ${el.selector}`)
    .join("\n");
}
