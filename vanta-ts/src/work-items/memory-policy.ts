import type { WorkItemState } from "./contract.js";

const ACCOMPLISHMENT_WORDS = /\b(?:accomplish(?:ed|ment)?|clos(?:ed|ure)|complet(?:e|ed|ion)|creat(?:e|ed|ion)|deliver(?:ed|y)?|deploy(?:ed|ment)?|finish(?:ed)?|fix(?:ed)?|implement(?:ed|ation)?|launch(?:ed)?|migrat(?:e|ed|ion)|publish(?:ed)?|releas(?:e|ed)|resolv(?:e|ed)|roll(?:ed)?\s+out|sen[dt]|ship(?:ped)?|solv(?:e|ed)|succeed(?:ed)?|went\s+live)\b/i;

export function canPersistMemoryClaim(
  content: string,
  completionState: WorkItemState | undefined,
): boolean {
  if (completionState === "verified") return true;
  if (ACCOMPLISHMENT_WORDS.test(content)) return false;
  return true;
}
