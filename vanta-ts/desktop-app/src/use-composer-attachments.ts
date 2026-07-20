import { useCallback, useState } from "react";
import { api } from "./api.js";
import { clipboardFilesToImages, mergeClipboardImages } from "./clipboard-paste.js";
import type { DesktopCaptureReceipt, DesktopImageAttachment, DesktopLookMode } from "./types.js";

type CaptureImage = { name: string; mime: "image/png"; dataBase64: string; capture: DesktopCaptureReceipt };
type CaptureResponse = { status: "captured"; images: CaptureImage[] } | { status: "cancelled" };

export function useComposerAttachments() {
  const [files, setFiles] = useState<string[]>([]);
  const [images, setImages] = useState<DesktopImageAttachment[]>([]);
  const [error, setError] = useState("");
  const [capturing, setCapturing] = useState(false);

  const addFile = useCallback((file: string) => setFiles((current) => current.includes(file) ? current : [...current, file]), []);
  const removeFile = useCallback((file: string) => setFiles((current) => current.filter((entry) => entry !== file)), []);
  const removeImage = useCallback((id: string) => {
    setImages((current) => current.filter((image) => image.id !== id));
    setError("");
  }, []);

  const pasteImages = useCallback(async (pasted: File[]) => {
    const result = await clipboardFilesToImages(pasted);
    setImages((current) => mergeClipboardImages(current, result.images));
    setError(result.errors.join(" "));
  }, []);

  const captureLook = useCallback(async (mode: DesktopLookMode) => {
    setCapturing(true);
    setError("");
    try {
      const result = await api<CaptureResponse>("/api/look", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (result.status === "captured") {
        const incoming = result.images.map((image) => ({ ...image, id: captureId(), bytes: image.capture.bytes }));
        setImages((current) => mergeClipboardImages(current, incoming));
      }
      return result.status;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return "failed" as const;
    } finally {
      setCapturing(false);
    }
  }, []);

  const clear = useCallback(() => { setFiles([]); setImages([]); setError(""); }, []);

  return { files, images, error, capturing, addFile, removeFile, removeImage, pasteImages, captureLook, clear };
}

export function withProjectAttachments(text: string, files: string[]): string {
  return [text.trim(), ...files.map((file) => `@${file}`)].filter(Boolean).join("\n");
}

function captureId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `look-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
