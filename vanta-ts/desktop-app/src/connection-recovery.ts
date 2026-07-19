export type ConnectionRecovery = "provider" | "project" | "service";

export function connectionRecovery(message: string): ConnectionRecovery {
  const normalized = message.toLowerCase();
  if (/\b401\b|unauthorized|authentication|oauth|credential|token (?:expired|revoked)|login required|api key/.test(normalized)) return "provider";
  if (/file|catalog|permission|enoent|json|parse/.test(normalized)) return "project";
  if (/provider|model|configure|setup/.test(normalized)) return "provider";
  if (/project/.test(normalized)) return "project";
  return "service";
}
