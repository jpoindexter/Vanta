import type { MouseEvent } from "react";
import { markdownToHtml } from "../../src/repl/copy-format.js";

const SAFE_LINK = /^(https?:|file:)/i;

export function MessageMarkdown({ content }: { content: string }) {
  const html = safeMessageHtml(content);

  function keepUnsafeLinksInert(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest("a[data-unsafe-link]");
    if (link) event.preventDefault();
  }

  return (
    <div
      className="message-markdown"
      onClick={keepUnsafeLinksInert}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function safeMessageHtml(content: string): string {
  return markdownToHtml(content).replace(
    /<a href="([^"]*)">([^<]*)<\/a>/g,
    (_match, href: string, label: string) => SAFE_LINK.test(href.trim())
      ? `<a href="${href}" target="_blank" rel="noreferrer">${label}</a>`
      : `<a href="#" data-unsafe-link="true" aria-disabled="true">${label}</a>`,
  );
}
