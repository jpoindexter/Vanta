import { useContext, type MouseEvent } from "react";
import { markdownToHtml } from "../../src/repl/copy-format.js";
import { DocumentLinkContext } from "./document-link-context.js";
import { localDocumentPath } from "./document-link.js";

const SAFE_LINK = /^https?:/i;

export function MessageMarkdown({ content }: { content: string }) {
  const documents = useContext(DocumentLinkContext);
  const html = safeMessageHtml(content, documents?.root);

  function keepUnsafeLinksInert(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>("a");
    if (link?.hasAttribute("data-unsafe-link")) event.preventDefault();
    if (!link?.hasAttribute("data-document-link")) return;
    event.preventDefault();
    const path = localDocumentPath(link.dataset.documentLink ?? "", documents?.root ?? "");
    if (path) documents?.open(path);
  }

  return (
    <div
      className="message-markdown"
      onClick={keepUnsafeLinksInert}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function safeMessageHtml(content: string, root = ""): string {
  return markdownToHtml(content).replace(
    /<a href="([^"]*)">([^<]*)<\/a>/g,
    (_match, href: string, label: string) => SAFE_LINK.test(href.trim())
      ? `<a href="${href}" target="_blank" rel="noreferrer">${label}</a>`
      : localDocumentPath(decodedAttribute(href), root)
        ? `<a href="#" data-document-link="${href}" title="Open document in Vanta">${label}</a>`
        : `<a href="#" data-unsafe-link="true" aria-disabled="true">${label}</a>`,
  );
}

function decodedAttribute(value: string): string {
  const entities: Record<string, string> = { "&amp;": "&", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">" };
  return value.replace(/&(?:amp|quot|lt|gt);|&#39;/g, (entity) => entities[entity]!);
}
