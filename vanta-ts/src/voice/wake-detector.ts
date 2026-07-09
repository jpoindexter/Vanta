export type WakeMatch = {
  matched: boolean;
  command: string;
};

type Token = { value: string; start: number; end: number };

function tokens(text: string): Token[] {
  const out: Token[] = [];
  for (const match of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    if (match.index === undefined) continue;
    out.push({ value: match[0].toLocaleLowerCase("en-US"), start: match.index, end: match.index + match[0].length });
  }
  return out;
}

/** Match the exact wake-word token sequence and return speech after it. */
export function detectWakePhrase(transcript: string, phrase = "hey vanta"): WakeMatch {
  const heard = tokens(transcript);
  const wanted = tokens(phrase).map((token) => token.value);
  if (wanted.length === 0 || heard.length < wanted.length) return { matched: false, command: "" };

  for (let start = 0; start <= heard.length - wanted.length; start += 1) {
    if (!wanted.every((value, offset) => heard[start + offset]?.value === value)) continue;
    const end = heard[start + wanted.length - 1]?.end ?? transcript.length;
    return { matched: true, command: transcript.slice(end).replace(/^[\s,.:;!?-]+/, "").trim() };
  }
  return { matched: false, command: "" };
}
