export type NativeClipboardPayload = {
  text: string;
  image?: { mime: "image/png"; dataBase64: string; bytes: number };
};

type DesktopBridge = {
  readClipboard?: () => Promise<NativeClipboardPayload>;
};

export function nativeClipboardAvailable(): boolean {
  return typeof desktopBridge()?.readClipboard === "function";
}

export async function readNativeClipboard(): Promise<{ text: string; files: File[] }> {
  const payload = await desktopBridge()?.readClipboard?.();
  if (!payload) return { text: "", files: [] };
  const files = payload.image ? [nativeImageFile(payload.image)] : [];
  return { text: payload.text ?? "", files };
}

function desktopBridge(): DesktopBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { vantaDesktop?: DesktopBridge }).vantaDesktop;
}

function nativeImageFile(image: NonNullable<NativeClipboardPayload["image"]>): File {
  const binary = atob(image.dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], "clipboard.png", { type: image.mime, lastModified: 0 });
}
