export type ConnectionRecovery = "provider" | "project" | "service";

export function connectionRecovery(message: string): ConnectionRecovery {
  const normalized = message.toLowerCase();
  if (/file|catalog|permission|enoent|json|parse/.test(normalized)) return "project";
  if (/provider|model|api key|configure|setup/.test(normalized)) return "provider";
  if (/project/.test(normalized)) return "project";
  return "service";
}
