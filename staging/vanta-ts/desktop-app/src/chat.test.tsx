import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("lucide-react", () => ({
  Archive: () => null,
  ArchiveRestore: () => null,
  ArrowUp: () => null,
  Check: () => null,
  Cpu: () => null,
  FolderKanban: () => null,
  ListPlus: () => null,
  MessageSquare: () => null,
  MoreHorizontal: () => null,
  Network: () => null,
  PackageOpen: () => null,
  Paperclip: () => null,
  Pencil: () => null,
  RotateCcw: () => null,
  Search: () => null,
  Square: () => null,
  Trash2: () => null,
  X: () => null,
}));

import { Composer } from "./chat.js";

describe("Composer attachments", () => {
  it("renders a native multi-file input for the attachment control", () => {
    const html = renderToStaticMarkup(
      <Composer
        value=""
        busy={false}
        attachments={[]}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onQueue={vi.fn()}
        onFiles={vi.fn()}
        onRemoveAttachment={vi.fn()}
        onStop={vi.fn()}
        onModel={vi.fn()}
        onCommand={vi.fn()}
      />,
    );

    expect(html).toContain('type="file"');
    expect(html).toContain('multiple=""');
    expect(html).toContain("Attach files");
  });
});
