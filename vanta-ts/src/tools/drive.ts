import { z } from "zod";
import type { Tool } from "./types.js";
import { googleFetch, buildUrl } from "../google/client.js";
export { driveCreateTool, driveUpdateTool, buildMultipartBody } from "./drive-write.js";

/** Max chars returned by drive_read — large files are truncated, not refused. */
const MAX_READ_CHARS = 80_000;
const DEFAULT_MIME = "text/plain";

const FILES_URL = "https://www.googleapis.com/drive/v3/files";

const ReadArgs = z.object({ id: z.string().min(1) });

function cap(text: string): string {
  return text.length > MAX_READ_CHARS
    ? `${text.slice(0, MAX_READ_CHARS)}\n…[truncated at ${MAX_READ_CHARS} chars]`
    : text;
}

/** Turn a thrown auth/network error into an actionable tool result. */
function failFromError(err: unknown): { ok: false; output: string } {
  return { ok: false, output: (err as Error).message };
}

export const driveReadTool: Tool = {
  schema: {
    name: "drive_read",
    description:
      "Read a Google Drive file's text content by file id. Falls back to plain-text export for Google-native docs.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Drive file id" } },
      required: ["id"],
    },
  },
  describeForSafety: () => "read a drive file",
  async execute(raw) {
    const parsed = ReadArgs.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'drive_read needs an "id" string' };
    }
    const { id } = parsed.data;
    try {
      const media = await googleFetch(
        buildUrl(`${FILES_URL}/${id}`, { alt: "media" }),
        { method: "GET" },
      );
      if (media.ok) {
        return { ok: true, output: cap(await media.text()) };
      }
      // Google-native docs (Docs/Sheets/Slides) reject alt=media — export instead.
      const exported = await googleFetch(
        buildUrl(`${FILES_URL}/${id}/export`, { mimeType: DEFAULT_MIME }),
        { method: "GET" },
      );
      if (exported.ok) {
        return { ok: true, output: cap(await exported.text()) };
      }
      return {
        ok: false,
        output: `drive_read failed: HTTP ${media.status} (and export HTTP ${exported.status}) for file ${id}`,
      };
    } catch (err) {
      return failFromError(err);
    }
  },
};

