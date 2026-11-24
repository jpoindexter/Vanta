import type { Approval, PermissionKind, PermissionSection } from "./types.js";

export type ApprovalSummary = {
  headline: string;
  lede: string;
  preview?: { label: string; text: string };
  details: PermissionSection[];
};

const PREVIEW_LABELS = ["Preview", "Command"];
// Sections already expressed by the headline; repeating them is extraneous load.
const REDUNDANT_LABELS: Partial<Record<PermissionKind, string[]>> = {
  file_edit: ["Target file", "Change"],
  file_write: ["Target file", "Write mode"],
  web_fetch: ["Target"],
};

export function summarizeApproval(approval: Approval): ApprovalSummary {
  const request = approval.request;
  const kind = request?.kind ?? "generic";
  const subject = (request?.subject || approval.action).trim();
  const sections = request?.sections ?? [];
  const headline = headlineFor(kind, subject, request?.title, approval.action);
  const preview = previewFor(kind, subject, headline, sections);
  const hidden = new Set([...(REDUNDANT_LABELS[kind] ?? []), ...(preview ? [preview.label] : [])]);
  return {
    headline,
    lede: ledeFor(request?.reason ?? approval.reason, headline),
    preview,
    details: sections.filter((section) => !hidden.has(section.label)),
  };
}

function headlineFor(kind: PermissionKind, subject: string, title: string | undefined, action: string): string {
  if (kind === "file_edit") return `Edit ${subject}`;
  if (kind === "file_write") return `${/^overwrite/i.test(action) ? "Overwrite" : "Write"} ${subject}`;
  if (kind === "bash") return "Run a command";
  if (kind === "web_fetch") return `Open ${hostOf(subject)}`;
  if (kind === "computer_use") return "Control your computer";
  if (kind === "sandbox") return "Run code";
  if (kind === "skill") return "Save a skill";
  return title?.replace(/\s*permission request$/i, "").trim() || action;
}

function previewFor(kind: PermissionKind, subject: string, headline: string, sections: PermissionSection[]): ApprovalSummary["preview"] {
  const found = sections.find((section) => PREVIEW_LABELS.includes(section.label));
  if (found) return { label: found.label, text: found.value };
  if (kind === "web_fetch" && subject !== hostOf(subject)) return { label: "Address", text: subject };
  if (kind === "generic" && subject && subject !== headline) return { label: "Action", text: subject };
  return undefined;
}

function ledeFor(reason: string, headline: string): string {
  const text = reason.trim();
  if (!text) return "";
  const sentence = text.charAt(0).toUpperCase() + text.slice(1);
  if (sentence.toLowerCase().replace(/\W/g, "") === headline.toLowerCase().replace(/\W/g, "")) return "";
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

function hostOf(value: string): string {
  try { return new URL(value).host || value; } catch { return value; }
}
