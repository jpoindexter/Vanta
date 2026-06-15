import type { ReachChannel } from "../channel.js";

const AUDIO_EXTS = /\.(mp3|m4a|ogg|wav|flac|aac|opus|wma)(\?.*)?$/i;
const PODCAST_HOSTS = /^https?:\/\/(podcasts\.apple\.com|open\.spotify\.com\/(show|episode)|overcast\.fm|pocketcasts\.com|anchor\.fm|podbean\.com|buzzsprout\.com)/i;

export const podcastChannel: ReachChannel = {
  name: "podcast",
  description: "Podcast audio transcription via Groq Whisper",
  backends: ["groq-whisper"],
  tier: 0,
  canHandle: (url) => AUDIO_EXTS.test(url) || PODCAST_HOSTS.test(url),
  async check(env) {
    const key = env["GROQ_API_KEY"];
    if (!key) {
      return {
        name: "podcast",
        status: "off",
        activeBackend: null,
        detail: "GROQ_API_KEY not set",
        fix: "get a free key at console.groq.com — set GROQ_API_KEY in .env",
      };
    }
    return { name: "podcast", status: "ok", activeBackend: "groq-whisper", detail: "GROQ_API_KEY present" };
  },
};
