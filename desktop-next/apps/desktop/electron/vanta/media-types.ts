import path from "node:path";

const MEDIA_MIME_TYPES: Record<string, string> = {
  ".avi": "video/x-msvideo",
  ".bmp": "image/bmp",
  ".flac": "audio/flac",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".m4a": "audio/mp4",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp"
};

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".c": "c",
  ".conf": "ini",
  ".cpp": "cpp",
  ".css": "css",
  ".csv": "csv",
  ".go": "go",
  ".graphql": "graphql",
  ".h": "c",
  ".hpp": "cpp",
  ".html": "html",
  ".java": "java",
  ".js": "javascript",
  ".json": "json",
  ".jsx": "jsx",
  ".kt": "kotlin",
  ".lua": "lua",
  ".md": "markdown",
  ".mjs": "javascript",
  ".py": "python",
  ".rb": "ruby",
  ".rs": "rust",
  ".sh": "shell",
  ".sql": "sql",
  ".svg": "xml",
  ".toml": "toml",
  ".ts": "typescript",
  ".tsx": "tsx",
  ".txt": "text",
  ".xml": "xml",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".zsh": "shell"
};

export const mimeTypeForPath = (file: string): string =>
  MEDIA_MIME_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";

export const languageForPath = (file: string): string => LANGUAGE_BY_EXTENSION[path.extname(file).toLowerCase()] ?? "text";

/** NUL bytes, or more than 12% control characters, mean the sample is not text. */
export function looksBinary(sample: Uint8Array): boolean {
  if (sample.length === 0) {
    return false;
  }

  let suspicious = 0;

  for (const byte of sample) {
    if (byte === 0) {
      return true;
    }

    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
      suspicious += 1;
    }
  }

  return suspicious / sample.length > 0.12;
}
