import { useCallback,useState,type Dispatch,type SetStateAction } from "react";
import { api } from "./api.js";
import { mergeClipboardImages } from "./clipboard-paste.js";
import type { DesktopCaptureReceipt,DesktopImageAttachment,DesktopLookMode } from "./types.js";

type CaptureImage = { name: string; mime: "image/png"; dataBase64: string; capture: DesktopCaptureReceipt };
type CaptureResponse = { status: "captured"; images: CaptureImage[] } | { status: "cancelled" };

export function useComposerCapture(
  setImages: Dispatch<SetStateAction<DesktopImageAttachment[]>>,
  setError: Dispatch<SetStateAction<string>>,
) {
  const [capturing, setCapturing] = useState(false);
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

  return { capturing, captureLook };
}

function captureId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `look-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
