import { FileText, Search, Sparkles } from "lucide-react";
import { focusDesktopComposer } from "./global-shortcuts.js";

export const chatStarters = [
  { label: "Make sense of a document", icon: FileText,
    prompt: "Help me understand a document. Ask me to attach it, then summarize the key points and anything that needs my attention." },
  { label: "Research a decision", icon: Search,
    prompt: "Help me research a decision. First ask what I’m deciding and what matters to me, then compare options with sources." },
  { label: "Turn an idea into action", icon: Sparkles,
    prompt: "Help me turn an idea into something useful. Ask what I want to achieve, then help me take the first concrete step." },
] as const;

type Props = { draft: string; ready: boolean; onDraft: (text: string) => void };

export function ChatWelcome({ draft, ready, onDraft }: Props) {
  return <section className="chat-welcome">
    <h1>What’s on your mind?</h1>
    <p>Research, write, build, or take care of everyday work.<br />Start here. Bring in tools when you need them.</p>
    {!draft ? <div className="chat-starters" role="group" aria-label="Ideas to start a chat">
      {chatStarters.map(({ label, icon: Icon, prompt }) => <button key={label} type="button" disabled={!ready}
        onClick={() => { onDraft(prompt); requestAnimationFrame(() => focusDesktopComposer()); }}>
        <Icon size={16} aria-hidden="true" /><span>{label}</span>
      </button>)}
    </div> : null}
  </section>;
}
