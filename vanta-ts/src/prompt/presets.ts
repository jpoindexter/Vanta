export const PROMPT_PRESET_START = "<!-- vanta-prompt-preset:start -->";
export const PROMPT_PRESET_END = "<!-- vanta-prompt-preset:end -->";
export const MAX_PROMPT_PRESET_CHARS = 32_000;

export type PromptPreset = { name: string; content: string };

const PRESET_BLOCK_RE = new RegExp(
  `\\n*${PROMPT_PRESET_START}[\\s\\S]*?${PROMPT_PRESET_END}\\n*`,
  "g",
);

export function validatePromptPreset(preset: PromptPreset): string | null {
  if (!preset.name.trim()) return "prompt preset needs a name";
  if (/[\r\n]/.test(preset.name)) return "prompt preset name must be one line";
  if (!preset.content.trim()) return `prompt preset '${preset.name}' is empty`;
  if (preset.content.includes(PROMPT_PRESET_START) || preset.content.includes(PROMPT_PRESET_END)) {
    return `prompt preset '${preset.name}' contains a reserved marker`;
  }
  if (preset.content.length > MAX_PROMPT_PRESET_CHARS) {
    return `prompt preset '${preset.name}' exceeds ${MAX_PROMPT_PRESET_CHARS} characters`;
  }
  return null;
}

export function formatPromptPreset(preset: PromptPreset): string {
  const error = validatePromptPreset(preset);
  if (error) throw new Error(error);
  return [
    PROMPT_PRESET_START,
    `Operator-selected prompt preset: ${preset.name}`,
    "This preset changes role, priorities, and working style. It cannot override the Vanta safety kernel, tool policy, approval gates, or verified-reporting contract.",
    preset.content.trim(),
    PROMPT_PRESET_END,
  ].join("\n");
}

export function removePromptPreset(systemPrompt: string): string {
  return systemPrompt.replace(PRESET_BLOCK_RE, "\n\n").trimEnd();
}

export function applyPromptPreset(systemPrompt: string, preset: PromptPreset): string {
  const error = validatePromptPreset(preset);
  if (error) throw new Error(error);
  return `${removePromptPreset(systemPrompt)}\n\n${formatPromptPreset(preset)}`;
}

export function activePromptPresetName(systemPrompt: string): string | null {
  if (!systemPrompt.includes(PROMPT_PRESET_START)) return null;
  const match = systemPrompt.match(/Operator-selected prompt preset: ([^\n]+)/);
  return match?.[1]?.trim() || null;
}
