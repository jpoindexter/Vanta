import { useCallback, useState } from "react";
import { clipboardFilesToImages, mergeClipboardImages } from "./clipboard-paste.js";
import type { DesktopImageAttachment } from "./types.js";

export function useComposerAttachments() {
  const [files, setFiles] = useState<string[]>([]);
  const [images, setImages] = useState<DesktopImageAttachment[]>([]);
  const [error, setError] = useState("");

  const addFile = useCallback((file: string) => {
    setFiles((current) => current.includes(file) ? current : [...current, file]);
  }, []);

  const removeFile = useCallback((file: string) => {
    setFiles((current) => current.filter((entry) => entry !== file));
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages((current) => current.filter((image) => image.id !== id));
    setError("");
  }, []);

  const pasteImages = useCallback(async (pasted: File[]) => {
    const result = await clipboardFilesToImages(pasted);
    setImages((current) => mergeClipboardImages(current, result.images));
    setError(result.errors.join(" "));
  }, []);

  const clear = useCallback(() => {
    setFiles([]);
    setImages([]);
    setError("");
  }, []);

  return { files, images, error, addFile, removeFile, removeImage, pasteImages, clear };
}

export function withProjectAttachments(text: string, files: string[]): string {
  return [text.trim(), ...files.map((file) => `@${file}`)].filter(Boolean).join("\n");
}
