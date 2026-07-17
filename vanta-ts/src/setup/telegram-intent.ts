export function isTelegramSetupQuestion(text: string): boolean {
  const normalized = text.toLowerCase().replace(/telgram/g, "telegram");
  return /\btelegram\b/.test(normalized)
    && /\b(set\s*up|setup|configure|connect|command|wizard)\b/.test(normalized);
}

export function isTelegramSetupCommand(text: string): boolean {
  return /^\/setup(?:\s+(?:messaging|telegram))?\s*$/i.test(text.trim());
}
