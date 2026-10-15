export type DesktopAttachmentItem = {
  id: string;
  kind: "file" | "folder";
  path: string;
  label: string;
  files: string[];
};

export type DesktopAttachmentSelection = {
  files: string[];
  items?: DesktopAttachmentItem[];
  errors: string[];
};

type DesktopAttachmentBridge = {
  resolveDroppedFiles?: (files: File[]) => Promise<DesktopAttachmentSelection>;
  pickAttachments?: () => Promise<DesktopAttachmentSelection>;
};

function bridge(): DesktopAttachmentBridge | undefined {
  return (window as Window & { vantaDesktop?: DesktopAttachmentBridge }).vantaDesktop;
}

export async function resolveDesktopDroppedFiles(files: File[]): Promise<DesktopAttachmentSelection> {
  if (!files.length) return { files: [], items: [], errors: [] };
  const resolveDroppedFiles = bridge()?.resolveDroppedFiles;
  if (!resolveDroppedFiles) {
    return { files: [], items: [], errors: ["File and folder drop is available in the Vanta desktop app."] };
  }
  return resolveDroppedFiles(files);
}

export async function pickDesktopAttachments(): Promise<DesktopAttachmentSelection> {
  const pickAttachments = bridge()?.pickAttachments;
  if (!pickAttachments) {
    return { files: [], items: [], errors: ["The native file picker is available in the Vanta desktop app."] };
  }
  return pickAttachments();
}

export function attachmentItemForFile(file: string): DesktopAttachmentItem {
  const label = file.split(/[\\/]/).filter(Boolean).at(-1) ?? file;
  return { id: `file:${file}`, kind: "file", path: file, label, files: [file] };
}

export function normalizedAttachmentItems(selection: DesktopAttachmentSelection): DesktopAttachmentItem[] {
  return selection.items?.length
    ? selection.items
    : selection.files.map(attachmentItemForFile);
}
