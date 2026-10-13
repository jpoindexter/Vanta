import { describe, expect, it, vi } from "vitest";

import { CH } from "./channels";
import { createExternalOpener } from "./external-links";

describe("external link opener", () => {
  it("opens web and mail links", () => {
    const openExternal = vi.fn(async () => undefined);
    const notify = vi.fn();
    const open = createExternalOpener({ notify, openExternal });

    open("https://example.com/a");
    open("mailto:a@example.com");

    expect(openExternal).toHaveBeenCalledTimes(2);
    expect(notify).not.toHaveBeenCalled();
  });

  it.each(["file:///etc/passwd", "javascript:alert(1)", "ssh://host", "vanta://session/x", "not a url", ""])(
    "refuses %j and tells the renderer instead of opening it",
    raw => {
      const openExternal = vi.fn(async () => undefined);
      const notify = vi.fn();

      createExternalOpener({ notify, openExternal })(raw);

      expect(openExternal).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith(CH.externalOpenFailed, expect.objectContaining({ message: expect.any(String) }));
    }
  );

  it("reports an OS failure to open", async () => {
    const notify = vi.fn();
    createExternalOpener({ notify, openExternal: async () => Promise.reject(new Error("no browser")) })("https://example.com");

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(notify).toHaveBeenCalledWith(CH.externalOpenFailed, { message: "no browser", url: "https://example.com/" });
  });
});
