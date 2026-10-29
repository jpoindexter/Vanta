import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MarkdownTextContent } from "@/components/assistant-ui/markdown-text";

afterEach(cleanup);

describe("transcript math authority", () => {
  it("does not inherit permission to render a math link", async () => {
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, "trust");
    Object.defineProperty(Object.prototype, "trust", { value: true, configurable: true, writable: true });
    try {
      const text = String.raw`Math $\href{https://example.invalid/inherited-math-trust}{control}$ remains readable.`;
      const { container } = render(<MarkdownTextContent isRunning={false} text={text} />);
      await waitFor(() => expect(container.querySelector(".katex")).not.toBeNull());
      expect(container.querySelector('a[href="https://example.invalid/inherited-math-trust"]')).toBeNull();
      expect(container.textContent).toContain("remains readable");
    } finally {
      cleanup();
      if (previous) Object.defineProperty(Object.prototype, "trust", previous);
      else Reflect.deleteProperty(Object.prototype, "trust");
    }
  });

  it("keeps inline and display equations and literal code readable", async () => {
    const text = "Inline $x^2+y^2$.\n\n$$\n\\frac{a}{b}\n$$\n\n```bash\necho $HOME\n```";
    const { container } = render(<MarkdownTextContent isRunning={false} text={text} />);
    await waitFor(() => expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2));
    expect(container.querySelector(".katex-display")).not.toBeNull();
    expect(container.querySelector("annotation")?.textContent).toContain("x^2+y^2");
    expect(container.textContent).toContain("echo $HOME");
  });
});
