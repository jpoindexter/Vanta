import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { detectRecorder, recordAudio } from "../src/voice/recorder.js";
import { detectWakePhrase } from "../src/voice/wake-detector.js";
import { runWakeLoop } from "../src/voice/wake-loop.js";
import { transcribeAudio, whisperAvailable } from "../src/voice/whisper-stt.js";

const run = promisify(execFile);
const model = process.env.VANTA_WAKE_MODEL?.trim() || "tiny.en";
const falseCorpus = [
  "The roadmap is ready for review.",
  "Hey Santa, set a timer.",
  "Try the Vanta command tomorrow.",
  "Can you hand me that document?",
  "The meeting starts at nine.",
  "We should finish this feature.",
  "Open the calendar after lunch.",
  "Vanta is a local operator.",
  "Hey Fanta, pour a drink.",
  "They invented a better workflow.",
];

async function sayToFile(text: string, path: string): Promise<void> {
  await run("say", ["-r", "165", "-o", path, text]);
}

async function falseTriggerProof(dir: string): Promise<number> {
  let falseTriggers = 0;
  for (let index = 0; index < falseCorpus.length; index += 1) {
    const path = join(dir, `normal-${index}.aiff`);
    await sayToFile(falseCorpus[index] ?? "", path);
    const transcript = transcribeAudio(path, { model });
    if (!transcript.ok) throw new Error(`False-trigger fixture ${index} did not transcribe: ${transcript.error}`);
    if (detectWakePhrase(transcript.text).matched) falseTriggers += 1;
  }
  return falseTriggers;
}

async function micWakeProof(): Promise<string> {
  const speech = ["Hey Vanta", "Open the roadmap"];
  let captureIndex = 0;
  let opened = "";
  const result = await runWakeLoop({
    maxWindows: 1,
    windowSec: 4,
    turnSec: 5,
    model,
    log: (line) => console.log(line),
    chime: async () => {},
    capture: async (seconds) => {
      const phrase = speech[captureIndex++];
      if (!phrase) throw new Error("Wake smoke requested an unexpected audio window");
      const spoken = new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          run("say", ["-r", "150", phrase]).then(() => resolve(), reject);
        }, 650);
      });
      const clip = await recordAudio(seconds, "ffmpeg");
      await spoken;
      return clip;
    },
    onTurn: async (text) => { opened = text; },
  });
  if (result.wakes !== 1 || result.turns !== 1 || !/open|roadmap/i.test(opened)) {
    throw new Error(`Physical-mic wake failed: ${JSON.stringify({ result, opened })}`);
  }
  return opened;
}

async function main(): Promise<void> {
  if (process.platform !== "darwin") throw new Error("Wake smoke currently requires macOS");
  if ((await detectRecorder()) !== "ffmpeg") throw new Error("Wake smoke needs ffmpeg");
  if (!whisperAvailable()) throw new Error("Wake smoke needs local Whisper");
  const dir = await mkdtemp(join(tmpdir(), "vanta-wake-smoke-"));
  try {
    const falseTriggers = await falseTriggerProof(dir);
    if (falseTriggers !== 0) throw new Error(`False-trigger gate failed: ${falseTriggers}/${falseCorpus.length}`);
    const opened = await micWakeProof();
    console.log(`wake smoke ok: physical mic opened “${opened}” · false triggers ${falseTriggers}/${falseCorpus.length} · model ${model}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

await main();
