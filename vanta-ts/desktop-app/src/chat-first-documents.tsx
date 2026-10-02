import { useEffect, useState } from "react";
import { FileText, X } from "lucide-react";
import { api } from "./api.js";
import { MessageMarkdown } from "./message-markdown.js";

export function useDocumentWorkbench(root: string) {
  const [paths, setPaths] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => { setPaths([]); setActive(null); }, [root]);
  const open = (path: string) => {
    setPaths((items) => items.includes(path) ? items : [...items, path]); setActive(path);
  };
  const close = (path: string) => {
    setPaths((items) => items.filter((item) => item !== path));
    if (active === path) setActive(null);
  };
  return { paths, active, open, close, setActive };
}

type Documents = ReturnType<typeof useDocumentWorkbench>;
export function DocumentTabs({ documents }: { documents: Documents }) {
  return <nav className="chat-document-tabs" aria-label="Open documents">{documents.paths.map((path) =>
    <div key={path} data-active={documents.active === path}>
      <button type="button" aria-pressed={documents.active === path} title={path} onClick={() => documents.setActive(path)}><FileText size={14} aria-hidden="true" /><span>{path.split("/").pop()}</span></button>
      <button type="button" aria-label={`Close ${path}`} onClick={() => documents.close(path)}><X size={14} /></button>
    </div>)}</nav>;
}

type Preview = { path: string; content: string; markdown: boolean };
export function DocumentPreview({ path, onAttach }: { path: string; onAttach: (path: string) => void }) {
  const [result, setResult] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [source, setSource] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setResult(null); setError(""); setSource(false);
    void api<Preview>(`/api/file-preview?path=${encodeURIComponent(path)}`).then((value) => {
      if (current) setResult(value);
    }).catch(() => { if (current) setError("This file cannot be previewed. It may be private, missing, binary or larger than 256 KiB."); });
    return () => { current = false; };
  }, [path, attempt]);
  return <section className="chat-document" aria-label={`Document ${path}`}>
    <header><span title={path}>{path}</span>{result?.markdown ? <button type="button" aria-pressed={source} onClick={() => setSource(!source)}>{source ? "Read document" : "View source"}</button> : null}
      <button type="button" disabled={!result || Boolean(error)} onClick={() => onAttach(path)}>Attach to chat</button></header>
    <div className="chat-document-body">{error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(attempt + 1)}>Retry preview</button></div>
      : result?.path === path ? result.markdown && !source ? <MessageMarkdown content={result.content} /> : <pre>{result.content}</pre>
        : <p role="status">Opening document…</p>}</div>
  </section>;
}
