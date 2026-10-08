import { captureDictation, dictationError, dictationMenu, dictationSeconds, dictationSetup } from "../voice/dictation-capture.js";

export type VoiceCliDeps = {
  capture?: typeof captureDictation;
  menu?: typeof dictationMenu;
  setup?: typeof dictationSetup;
  log?: (text: string) => void;
  progress?: (text: string) => void;
  env?: NodeJS.ProcessEnv;
};

/** Local voice commands do not initialize an agent or call a model provider. */
export async function runDictationCommand(args: string[], deps: VoiceCliDeps = {}): Promise<void> {
  const [verb = "status", value, ...extra] = args;
  const env = deps.env ?? process.env;
  const log = deps.log ?? console.log;
  const info = await voiceInfo(verb, env, deps);
  if (info !== undefined) return log(info);
  if (!["record", "test"].includes(verb) || extra.length) return log("Usage: vanta voice [status|setup|record [seconds]|test [seconds]|conversation|mic|wake]");
  const seconds = dictationSeconds(value);
  if (seconds === undefined) return log("Record between 1 and 60 seconds.");
  await recordCommand(seconds, env, deps);
}

async function voiceInfo(verb: string, env: NodeJS.ProcessEnv, deps: VoiceCliDeps): Promise<string | undefined> {
  if (verb === "setup") return (deps.setup ?? dictationSetup)(env, "vanta voice");
  if (["status", "help", "--help"].includes(verb)) return (deps.menu ?? dictationMenu)(env, "vanta voice");
  if (verb === "model") return "Select a local model for a command with VANTA_STT_MODEL=<name> vanta voice status (or record). Use /voice model <name> inside the TUI.";
  if (verb === "cancel") return "Cancel an active CLI recording with Ctrl+C. In the TUI use /voice cancel.";
  return undefined;
}

async function recordCommand(seconds: number, env: NodeJS.ProcessEnv, deps: VoiceCliDeps): Promise<void> {
  const log = deps.log ?? console.log;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel);
  try {
    const progress = deps.progress ?? console.error;
    progress("Checking local dictation. Ctrl+C cancels. Nothing is sent to the agent.");
    const onPhase = (phase: "checking" | "recording" | "transcribing"): void => {
      if (phase === "recording") progress(`Recording locally for ${seconds}s. Ctrl+C cancels.`);
      if (phase === "transcribing") progress("Transcribing locally. Ctrl+C cancels.");
    };
    const text = await (deps.capture ?? captureDictation)({ seconds, signal: controller.signal, env, onPhase });
    if (!controller.signal.aborted) log(text);
  } catch (error) { log(dictationError(error, controller.signal)); }
  finally { process.removeListener("SIGINT", cancel); }
}
