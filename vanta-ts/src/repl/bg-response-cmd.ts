import type { BackgroundResponse, ReplState, SlashHandler } from "./types.js";

function oneLine(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > 72 ? `${clean.slice(0, 69)}...` : clean;
}

export function isBackgroundResponseRunning(state: ReplState): boolean {
  return state.backgroundResponse?.status === "running";
}

export function startBackgroundResponse(state: ReplState, prompt: string, now: Date): string {
  if (isBackgroundResponseRunning(state)) return "  ◌ response is already in the background — /bg to check it";
  state.backgroundResponse = {
    id: `bg-${state.turnIndex || 1}`,
    prompt,
    startedAt: now.toISOString(),
    status: "running",
  };
  return `  ◌ response moved to background — /bg to attach when it finishes`;
}

export function finishBackgroundResponse(state: ReplState, finalText: string, now: Date): void {
  const bg = state.backgroundResponse;
  if (!bg || bg.status !== "running") return;
  state.backgroundResponse = { ...bg, status: "done", completedAt: now.toISOString(), finalText };
}

export function failBackgroundResponse(state: ReplState, error: string, now: Date): void {
  const bg = state.backgroundResponse;
  if (!bg || bg.status !== "running") return;
  state.backgroundResponse = { ...bg, status: "failed", completedAt: now.toISOString(), error };
}

export function formatBackgroundResponse(bg: BackgroundResponse | undefined, arg = ""): string {
  const verb = arg.trim().toLowerCase();
  if (!bg) return "  (no background response)";
  if (verb === "clear") return "";
  const prompt = oneLine(bg.prompt);
  if (bg.status === "running") return `  ◌ background response still running: ${prompt}`;
  if (bg.status === "failed") return `  ✗ background response failed: ${bg.error ?? "unknown error"}\n  Prompt: ${prompt}`;
  return [`  ✓ background response complete: ${prompt}`, "", bg.finalText?.trim() || "(empty response)"].join("\n");
}

export const bg: SlashHandler = (arg, ctx) => {
  if (arg.trim().toLowerCase() === "clear") {
    ctx.state.backgroundResponse = undefined;
    return { output: "  · cleared background response" };
  }
  return { output: formatBackgroundResponse(ctx.state.backgroundResponse, arg) };
};
