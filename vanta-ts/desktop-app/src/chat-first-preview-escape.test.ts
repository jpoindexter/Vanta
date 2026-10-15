import { describe, expect, it, vi } from "vitest";
import { handlePreviewEscape } from "./chat-first-preview.js";

describe("preview Escape ownership", () => {
  function fixture(dialog: boolean, key = "Escape") {
    const event = { key, stopPropagation: vi.fn(), preventDefault: vi.fn() };
    const dismiss = vi.fn();
    const querySelector = vi.fn().mockReturnValue(dialog ? {} : null);
    handlePreviewEscape(event as unknown as KeyboardEvent, dismiss, { querySelector });
    return { event, dismiss, querySelector };
  }
  it("leaves Escape to compact dialogs even without aria-modal", () => {
    const { event, dismiss, querySelector } = fixture(true);
    expect(querySelector).toHaveBeenCalledWith('.chat-first-shell [role="dialog"]');
    expect(dismiss).toHaveBeenCalledOnce();
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
  it("consumes Escape only when the preview owns it", () => {
    const { event, dismiss } = fixture(false);
    expect(dismiss).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });
  it("leaves other keys alone", () => {
    const { event, dismiss } = fixture(false, "Tab");
    expect(dismiss).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });
});
