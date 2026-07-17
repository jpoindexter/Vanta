import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { acknowledgeWarning, FullAccessWarning, fullAccessScope, FULL_ACCESS_WARNING_STORAGE_KEY, FULL_ACCESS_WARNING_VERSION, resetWarningAcknowledgement, warningAcknowledged } from "./full-access-warning.js";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial) values.set(FULL_ACCESS_WARNING_STORAGE_KEY, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe("full access warning", () => {
  it("invalidates acknowledgements when the project scope or risk version changes", () => {
    const storage = memoryStorage();
    const first = fullAccessScope("/workspace/one");
    acknowledgeWarning(storage, first);
    expect(warningAcknowledged(storage, first)).toBe(true);
    expect(warningAcknowledged(storage, fullAccessScope("/workspace/two"))).toBe(false);
    storage.setItem(FULL_ACCESS_WARNING_STORAGE_KEY, JSON.stringify({ version: `${FULL_ACCESS_WARNING_VERSION}-old`, scope: first }));
    expect(warningAcknowledged(storage, first)).toBe(false);
    resetWarningAcknowledgement(storage);
    expect(storage.getItem(FULL_ACCESS_WARNING_STORAGE_KEY)).toBeNull();
  });

  it("announces the material risk, boundary, and both dismissal paths", () => {
    const html = renderToStaticMarkup(<FullAccessWarning visible onClose={() => undefined} onAcknowledge={() => undefined} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain("run commands, use the internet");
    expect(html).toContain("data loss");
    expect(html).toContain("prompt injection");
    expect(html).toContain("Kernel-blocked actions remain blocked");
    expect(html).toContain("Don&#x27;t show again");
    expect(html).toContain("Close full access warning");
  });
});
